import { test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getSchedule } from '@/app/api/schedule/route';
import { GET as getOverview } from '@/app/api/admin/overview/route';
import { PUT as saveSchedule } from '@/app/api/admin/schedule/route';
import { POST as generate } from '@/app/api/admin/schedule/generate/route';
import { POST as publish } from '@/app/api/admin/schedule/publish/route';
import { GET as listEmails, POST as addEmail, DELETE as removeEmail } from '@/app/api/admin/allowed-emails/route';
import { GET as listUsers, PUT as setUserAdmin } from '@/app/api/admin/users/route';

const WEEK = '2026-07-19';
const DATES = ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'];

async function adminReq(method: string, url: string, body?: unknown, adminUserId = 999): Promise<Request> {
  const token = await createSessionToken({ userId: adminUserId, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function techReq(url: string, techId: number): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request(`http://test${url}`, { headers: { cookie: `session=${token}` } });
}

let techIds: number[];
let stationIds: number[];

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
  techIds = [];
  for (let i = 1; i <= 10; i++) {
    const t = await prisma.technician.create({
      data: { name: `טכנאי ${i}`, email: `t${i}@x.com`, passwordHash: 'x' },
    });
    techIds.push(t.id);
    // 8 techs fill all 5 days as flex; techs 9-10 fill nothing
    if (i <= 8) {
      for (const date of DATES) {
        await prisma.constraint.create({ data: { technicianId: t.id, date, value: 'flex' } });
      }
    }
  }
  stationIds = [];
  for (let i = 1; i <= 4; i++) {
    const s = await prisma.station.create({ data: { name: `עמדה ${i}`, position: i } });
    stationIds.push(s.id);
  }
});

afterEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
});

test('admin routes reject non-admin sessions', async () => {
  expect((await getOverview(await techReq(`/x?weekStart=${WEEK}`, techIds[0]))).status).toBe(403);
  expect((await generate(await techReq('/x', techIds[0]))).status).toBe(403);
});

test('overview reports fill status and constraint table', async () => {
  const res = await getOverview(await adminReq('GET', `/api/admin/overview?weekStart=${WEEK}`));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.dates).toEqual(DATES);
  const statuses = data.technicians.map((t: { status: string }) => t.status);
  expect(statuses.filter((s: string) => s === 'full')).toHaveLength(8);
  expect(statuses.filter((s: string) => s === 'none')).toHaveLength(2);
  expect(data.constraints[String(techIds[0])]['2026-07-19']).toBe('flex');
  expect(data.scheduleStatus).toBeNull();
});

test('overview reports partial status', async () => {
  await prisma.constraint.create({ data: { technicianId: techIds[8], date: DATES[0], value: 'morning' } });
  const res = await getOverview(await adminReq('GET', `/api/admin/overview?weekStart=${WEEK}`));
  const data = await res.json();
  const t9 = data.technicians.find((t: { id: number }) => t.id === techIds[8]);
  expect(t9.status).toBe('partial');
});

test('generate creates a full draft respecting hard rules', async () => {
  const res = await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.status).toBe('draft');
  expect(schedule!.assignments).toHaveLength(40); // 5 days * 2 shifts * 4 stations
  for (const date of DATES) {
    const day = schedule!.assignments.filter(a => a.date === date);
    const ids = day.map(a => a.technicianId);
    expect(new Set(ids).size).toBe(ids.length); // nobody twice per day
  }
});

test('generate only fills active stations, ignoring inactive ones', async () => {
  await prisma.station.update({ where: { id: stationIds[3] }, data: { active: false } });
  const res = await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.assignments).toHaveLength(30); // 5 days * 2 shifts * 3 active stations
  expect(schedule!.assignments.every(a => a.stationId !== stationIds[3])).toBe(true);
});

test('generate with no active stations produces an empty schedule', async () => {
  await prisma.station.updateMany({ data: { active: false } });
  const res = await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.assignments).toHaveLength(0);
});

test('generate regenerates (replaces) an existing draft', async () => {
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  const count = await prisma.assignment.count();
  expect(count).toBe(40);
});

test('save schedule replaces assignments and persists includeFriday', async () => {
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: true,
    assignments: [{ date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[0] }],
  }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.includeFriday).toBe(true);
  expect(schedule!.status).toBe('draft');
  expect(schedule!.assignments).toHaveLength(1);
});

test('save schedule drops assignments outside the active week days', async () => {
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [
      { date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[0] },
      { date: '2026-07-24', shift: 'morning', stationId: stationIds[0], technicianId: techIds[1] }, // Friday while includeFriday=false
    ],
  }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.assignments).toHaveLength(1);
  expect(schedule!.assignments[0].date).toBe(DATES[0]);
});

test('save schedule rejects malformed assignment objects with 400', async () => {
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [{ date: DATES[0], shift: 'night', stationId: 'nope', technicianId: 'x' }],
  }));
  expect(res.status).toBe(400);
});

test('save schedule accepts a row with technicianId null when experimenter or note is present', async () => {
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [
      { date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: null, experimenter: 'ד"ר כהן' },
      { date: DATES[0], shift: 'evening', stationId: stationIds[1], technicianId: null, note: 'תחזוקה' },
    ],
  }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.assignments).toHaveLength(2);
  expect(schedule!.assignments.find(a => a.shift === 'morning')).toMatchObject({
    technicianId: null,
    experimenter: 'ד"ר כהן',
  });
  expect(schedule!.assignments.find(a => a.shift === 'evening')).toMatchObject({
    technicianId: null,
    note: 'תחזוקה',
  });
});

test('save schedule still blocks off/absent technicians when technicianId is set', async () => {
  await prisma.constraint.upsert({
    where: { technicianId_date: { technicianId: techIds[0], date: DATES[0] } },
    update: { value: 'off' },
    create: { technicianId: techIds[0], date: DATES[0], value: 'off' },
  });
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [{ date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[0] }],
  }));
  expect(res.status).toBe(400);
});

test('technician sees schedule only after publish; admin always', async () => {
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));

  const techBefore = await getSchedule(await techReq(`/api/schedule?weekStart=${WEEK}`, techIds[0]));
  expect((await techBefore.json()).schedule).toBeNull();

  const adminView = await getSchedule(await adminReq('GET', `/api/schedule?weekStart=${WEEK}`));
  expect((await adminView.json()).schedule.status).toBe('draft');

  const pub = await publish(await adminReq('POST', '/x', { weekStart: WEEK }));
  expect(pub.status).toBe(200);

  const techAfter = await getSchedule(await techReq(`/api/schedule?weekStart=${WEEK}`, techIds[0]));
  const data = await techAfter.json();
  expect(data.schedule.status).toBe('published');
  expect(data.schedule.assignments).toHaveLength(40);
  expect(data.technicians.length).toBe(10);
});

test('publish 404s when no schedule exists', async () => {
  expect((await publish(await adminReq('POST', '/x', { weekStart: '2030-01-06' }))).status).toBe(404);
});

test('admins are excluded from overview, schedule technicians, and generation', async () => {
  const admin = await prisma.technician.create({
    data: { name: 'מנהל', email: 'boss@x.com', passwordHash: 'x', isAdmin: true },
  });
  for (const date of DATES) {
    await prisma.constraint.create({ data: { technicianId: admin.id, date, value: 'flex' } });
  }
  const overview = await (await getOverview(await adminReq('GET', `/x?weekStart=${WEEK}`))).json();
  expect(overview.technicians.find((t: { id: number }) => t.id === admin.id)).toBeUndefined();

  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  const assigned = await prisma.assignment.findMany({ where: { technicianId: admin.id } });
  expect(assigned).toHaveLength(0);

  const sched = await (await getSchedule(await adminReq('GET', `/x?weekStart=${WEEK}`))).json();
  expect(sched.technicians.find((t: { id: number }) => t.id === admin.id)).toBeUndefined();
});

test('allowed-emails: add, list, reject duplicate/invalid, remove', async () => {
  expect((await addEmail(await adminReq('POST', '/x', { email: 'New@X.com' }))).status).toBe(200);
  expect((await addEmail(await adminReq('POST', '/x', { email: 'new@x.com' }))).status).toBe(409);
  expect((await addEmail(await adminReq('POST', '/x', { email: 'not-an-email' }))).status).toBe(400);
  const list = await (await listEmails(await adminReq('GET', '/x'))).json();
  expect(list.emails.map((e: { email: string }) => e.email)).toEqual(['new@x.com']);
  expect((await removeEmail(await adminReq('DELETE', '/x', { email: 'new@x.com' }))).status).toBe(200);
  expect((await (await listEmails(await adminReq('GET', '/x'))).json()).emails).toHaveLength(0);
});

test('users: list all, toggle admin, refuse self-change', async () => {
  const me = await prisma.technician.create({
    data: { name: 'אני', email: 'me@x.com', passwordHash: 'x', isAdmin: true },
  });
  const users = await (await listUsers(await adminReq('GET', '/x', undefined, me.id))).json();
  expect(users.users.length).toBe(11); // 10 technicians + me
  const target = techIds[0];
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: target, isAdmin: true }, me.id))).status).toBe(200);
  expect((await prisma.technician.findUnique({ where: { id: target } }))!.isAdmin).toBe(true);
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: me.id, isAdmin: false }, me.id))).status).toBe(400);
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: 123456, isAdmin: true }, me.id))).status).toBe(404);
});
