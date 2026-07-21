import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getReports } from '@/app/api/admin/reports/route';
import { GET as getVacationSummary } from '@/app/api/admin/vacation-summary/route';

async function adminReq(url: string): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, { headers: { cookie: `session=${token}` } });
}

let techId: number;
let stationIds: number[];

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
  const t = await prisma.technician.create({
    data: { name: 'רון', email: 'rep@x.com', passwordHash: 'x' },
  });
  techId = t.id;
  stationIds = [];
  for (let i = 1; i <= 3; i++) {
    const s = await prisma.station.create({ data: { name: `עמדה ${i}`, position: i } });
    stationIds.push(s.id);
  }
  const pub = await prisma.schedule.create({ data: { weekStart: '2026-07-05', status: 'published' } });
  const draft = await prisma.schedule.create({ data: { weekStart: '2026-07-12', status: 'draft' } });
  await prisma.assignment.createMany({
    data: [
      { scheduleId: pub.id, date: '2026-07-05', shift: 'morning', stationId: stationIds[1], technicianId: techId },
      { scheduleId: pub.id, date: '2026-07-06', shift: 'evening', stationId: stationIds[2], technicianId: techId },
      { scheduleId: draft.id, date: '2026-07-13', shift: 'morning', stationId: stationIds[0], technicianId: techId },
    ],
  });
});

test('returns published assignments in range with technician name and station name, ordered', async () => {
  const res = await getReports(await adminReq('/x?from=2026-07-01&to=2026-07-31'));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.assignments).toHaveLength(2); // draft excluded
  expect(data.assignments[0]).toMatchObject({
    date: '2026-07-05', shift: 'morning', stationId: stationIds[1], stationName: 'עמדה 2',
    technicianId: techId, technicianName: 'רון',
  });
});

test('includes rows without a technician (experimenter/note only) with null technician fields', async () => {
  const pub = (await prisma.schedule.findUnique({ where: { weekStart: '2026-07-05' } }))!;
  await prisma.assignment.create({
    data: {
      scheduleId: pub.id, date: '2026-07-05', shift: 'evening', stationId: stationIds[0],
      technicianId: null, experimenter: 'ד"ר לוי',
    },
  });
  const res = await getReports(await adminReq('/x?from=2026-07-01&to=2026-07-31'));
  const data = await res.json();
  const row = data.assignments.find((a: { technicianId: number | null }) => a.technicianId === null);
  expect(row).toMatchObject({ stationId: stationIds[0], technicianName: null, experimenter: 'ד"ר לוי' });
});

test('range filter excludes out-of-range dates', async () => {
  const res = await getReports(await adminReq('/x?from=2026-07-06&to=2026-07-06'));
  const data = await res.json();
  expect(data.assignments).toHaveLength(1);
  expect(data.assignments[0].date).toBe('2026-07-06');
});

test('rejects invalid range or missing params with 400', async () => {
  expect((await getReports(await adminReq('/x?from=2026-07-31&to=2026-07-01'))).status).toBe(400);
  expect((await getReports(await adminReq('/x?from=2026-07-01'))).status).toBe(400);
});

test('rejects non-admin with 403', async () => {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'רון' });
  const res = await getReports(new Request('http://test/x?from=2026-07-01&to=2026-07-31', {
    headers: { cookie: `session=${token}` },
  }));
  expect(res.status).toBe(403);
});

test('vacation summary counts absence days clipped to range plus off-marked days', async () => {
  // 3-day vacation fully inside range, sick range extends past the end (clip to 2 days), 2 off days
  await prisma.absence.create({
    data: { technicianId: techId, startDate: '2026-07-06', endDate: '2026-07-08', type: 'vacation' },
  });
  await prisma.absence.create({
    data: { technicianId: techId, startDate: '2026-07-30', endDate: '2026-08-05', type: 'sick' },
  });
  await prisma.constraint.createMany({
    data: [
      { technicianId: techId, date: '2026-07-12', value: 'off' },
      { technicianId: techId, date: '2026-07-13', value: 'off' },
      { technicianId: techId, date: '2026-07-14', value: 'morning' },
    ],
  });
  const res = await getVacationSummary(await adminReq('/x?from=2026-07-01&to=2026-07-31'));
  expect(res.status).toBe(200);
  const row = (await res.json()).summary.find((s: { technicianId: number }) => s.technicianId === techId);
  expect(row).toMatchObject({ vacation: 3, sick: 2, miluim: 0, other: 0, offMarked: 2, total: 5 });
});

test('vacation summary rejects non-admin and bad range', async () => {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'רון' });
  expect((await getVacationSummary(new Request('http://test/x?from=2026-01-01&to=2026-12-31', {
    headers: { cookie: `session=${token}` },
  }))).status).toBe(403);
  expect((await getVacationSummary(await adminReq('/x?from=2026-12-31&to=2026-01-01'))).status).toBe(400);
});
