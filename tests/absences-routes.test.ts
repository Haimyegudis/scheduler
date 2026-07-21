import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as listAbsences, POST as addAbsence, DELETE as removeAbsence } from '@/app/api/admin/absences/route';
import { GET as getConstraints, PUT as putConstraint } from '@/app/api/constraints/route';
import { GET as getOverview } from '@/app/api/admin/overview/route';
import { POST as generate } from '@/app/api/admin/schedule/generate/route';
import { PUT as saveSchedule } from '@/app/api/admin/schedule/route';

const WEEK = '2026-07-19';
const DATES = ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'];

async function adminReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function techReq(method: string, url: string, techId: number, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

let techIds: number[];
let stationIds: number[];

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
  techIds = [];
  for (let i = 1; i <= 9; i++) {
    const t = await prisma.technician.create({
      data: { name: `טכנאי ${i}`, email: `abs${i}@x.com`, passwordHash: 'x' },
    });
    techIds.push(t.id);
    for (const date of DATES) {
      await prisma.constraint.create({ data: { technicianId: t.id, date, value: 'flex' } });
    }
  }
  stationIds = [];
  for (let i = 1; i <= 9; i++) {
    const s = await prisma.station.create({ data: { name: `עמדה ${i}`, position: i } });
    stationIds.push(s.id);
  }
});

test('absence CRUD: add, list with technician name, delete; validation', async () => {
  const add = await addAbsence(await adminReq('POST', '/x', {
    technicianId: techIds[0], startDate: DATES[0], endDate: DATES[2], type: 'miluim',
  }));
  expect(add.status).toBe(200);
  const list = await (await listAbsences(await adminReq('GET', '/x'))).json();
  expect(list.absences).toHaveLength(1);
  expect(list.absences[0].technicianName).toBe('טכנאי 1');
  expect(list.absences[0].type).toBe('miluim');

  expect((await addAbsence(await adminReq('POST', '/x', { technicianId: techIds[0], startDate: DATES[2], endDate: DATES[0], type: 'sick' }))).status).toBe(400); // end before start
  expect((await addAbsence(await adminReq('POST', '/x', { technicianId: techIds[0], startDate: DATES[0], endDate: DATES[1], type: 'party' }))).status).toBe(400); // bad type
  expect((await addAbsence(await adminReq('POST', '/x', { technicianId: 123456, startDate: DATES[0], endDate: DATES[1], type: 'sick' }))).status).toBe(404);

  expect((await removeAbsence(await adminReq('DELETE', '/x', { id: list.absences[0].id }))).status).toBe(200);
  expect((await (await listAbsences(await adminReq('GET', '/x'))).json()).absences).toHaveLength(0);
});

test('absences route rejects non-admin', async () => {
  expect((await listAbsences(await techReq('GET', '/x', techIds[0]))).status).toBe(403);
});

test('absence excludes technician from generation on absent days only', async () => {
  await addAbsence(await adminReq('POST', '/x', {
    technicianId: techIds[0], startDate: DATES[0], endDate: DATES[1], type: 'vacation',
  }));
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  const onAbsent = await prisma.assignment.findMany({
    where: { technicianId: techIds[0], date: { in: [DATES[0], DATES[1]] } },
  });
  expect(onAbsent).toHaveLength(0);
  // 8 available techs on absent days still fill all 8 slots
  const day0 = await prisma.assignment.findMany({ where: { date: DATES[0] } });
  expect(day0).toHaveLength(8);
});

test('technician sees own absences and cannot edit an absent day', async () => {
  await addAbsence(await adminReq('POST', '/x', {
    technicianId: techIds[0], startDate: DATES[1], endDate: DATES[1], type: 'sick',
  }));
  const data = await (await getConstraints(await techReq('GET', `/x?weekStart=${WEEK}`, techIds[0]))).json();
  expect(data.absences[DATES[1]]).toBe('sick');
  expect(data.absences[DATES[0]]).toBeUndefined();
  const put = await putConstraint(await techReq('PUT', '/x', techIds[0], { date: DATES[1], value: 'morning' }));
  expect(put.status).toBe(409);
});

test('manual save rejects assignment on an off or absent day with 400', async () => {
  await prisma.constraint.update({
    where: { technicianId_date: { technicianId: techIds[1], date: DATES[0] } },
    data: { value: 'off' },
  });
  const offRes = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [{ date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[1] }],
  }));
  expect(offRes.status).toBe(400);

  await addAbsence(await adminReq('POST', '/x', {
    technicianId: techIds[2], startDate: DATES[0], endDate: DATES[0], type: 'sick',
  }));
  const absRes = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [{ date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[2] }],
  }));
  expect(absRes.status).toBe(400);

  // shift-type mismatch is still allowed (warning-only in UI)
  const mismatch = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: false,
    assignments: [{ date: DATES[0], shift: 'morning', stationId: stationIds[0], technicianId: techIds[3] }],
  }));
  expect(mismatch.status).toBe(200);
});

test('overview includes absence map and counts absent days as filled', async () => {
  // tech 9: no constraints at all, absent all week -> status full
  const t9 = techIds[8];
  await prisma.constraint.deleteMany({ where: { technicianId: t9 } });
  await addAbsence(await adminReq('POST', '/x', {
    technicianId: t9, startDate: DATES[0], endDate: DATES[4], type: 'vacation',
  }));
  const data = await (await getOverview(await adminReq('GET', `/x?weekStart=${WEEK}`))).json();
  expect(data.absences[String(t9)][DATES[0]]).toBe('vacation');
  const row = data.technicians.find((t: { id: number }) => t.id === t9);
  expect(row.status).toBe('full');
});
