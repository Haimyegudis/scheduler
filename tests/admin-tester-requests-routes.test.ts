import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { addDays } from '@/lib/dates';
import { GET, PUT, POST } from '@/app/api/admin/tester-requests/route';

const WEEK = '2026-07-19';

async function adminReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

let testerId: number;
let stationId: number;

beforeEach(async () => {
  await prisma.testerRequest.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
  const t = await prisma.technician.create({ data: { name: 'נסיין', email: 'n@x.com', passwordHash: 'x', role: 'tester' } });
  testerId = t.id;
  const s = await prisma.station.create({ data: { name: 'Press 1', position: 0 } });
  stationId = s.id;
});

test('GET returns only the requested week, pending first', async () => {
  await prisma.testerRequest.createMany({
    data: [
      { testerId, date: '2026-07-20', shift: 'morning', description: 'in week' },
      { testerId, date: '2026-07-26', shift: 'morning', description: 'next week' },
      { testerId, date: '2026-07-21', shift: 'evening', description: 'approved', status: 'approved' },
    ],
  });
  const res = await GET(await adminReq('GET', `/api/admin/tester-requests?weekStart=${WEEK}`));
  expect(res.status).toBe(200);
  const { requests } = await res.json();
  expect(requests).toHaveLength(2);
  expect(requests[0].status).toBe('pending');
  expect(requests[0].tester.name).toBe('נסיין');
});

test('PUT approve sets status and assignedStationId', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  const res = await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId }));
  expect(res.status).toBe(200);
  const row = await prisma.testerRequest.findUnique({ where: { id: r.id } });
  expect(row!.status).toBe('approved');
  expect(row!.assignedStationId).toBe(stationId);
});

test('PUT approve requires an existing station', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve' }))).status).toBe(400);
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId: stationId + 99 }))).status).toBe(400);
});

test('PUT reject sets status', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'reject' }))).status).toBe(200);
  expect((await prisma.testerRequest.findUnique({ where: { id: r.id } }))!.status).toBe('rejected');
});

test('PUT 404s on unknown request and rejects bad action', async () => {
  expect((await PUT(await adminReq('PUT', '/x', { id: 12345, action: 'reject' }))).status).toBe(404);
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'zap' }))).status).toBe(400);
});

test('requires admin session', async () => {
  const token = await createSessionToken({ userId: testerId, role: 'tester', name: 'נ' });
  const res = await GET(new Request(`http://test/x?weekStart=${WEEK}`, { headers: { cookie: `session=${token}` } }));
  expect(res.status).toBe(403);
});

test('GET without weekStart returns upcoming requests only', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await prisma.testerRequest.createMany({
    data: [
      { testerId, date: addDays(today, -1), shift: 'morning', description: 'old' },
      { testerId, date: addDays(today, 1), shift: 'morning', description: 'soon' },
    ],
  });
  const res = await GET(await adminReq('GET', '/api/admin/tester-requests'));
  expect(res.status).toBe(200);
  const { requests } = await res.json();
  expect(requests).toHaveLength(1);
  expect(requests[0].description).toBe('soon');
});

test('POST creates a request on behalf of a tester', async () => {
  const res = await POST(await adminReq('POST', '/x', { testerId, date: '2026-07-20', shift: 'morning', stationId, description: 'ניסוי' }));
  expect(res.status).toBe(200);
  const rows = await prisma.testerRequest.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ testerId, stationId, status: 'pending', description: 'ניסוי' });
});

test('POST rejects non-tester testerId and bad fields', async () => {
  const worker = await prisma.technician.create({ data: { name: 'ע', email: 'w@x.com', passwordHash: 'x' } });
  expect((await POST(await adminReq('POST', '/x', { testerId: worker.id, date: '2026-07-20', shift: 'morning', description: 'x' }))).status).toBe(400);
  expect((await POST(await adminReq('POST', '/x', { testerId, date: 'bad', shift: 'morning', description: 'x' }))).status).toBe(400);
  expect((await POST(await adminReq('POST', '/x', { testerId, date: '2026-07-20', shift: 'morning', description: '' }))).status).toBe(400);
});

test('PUT approve with place creates draft schedule and assignment with experimenter', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  const res = await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId, place: true }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: '2026-07-19' }, include: { assignments: true } });
  expect(schedule).not.toBeNull();
  expect(schedule!.status).toBe('draft');
  expect(schedule!.assignments).toHaveLength(1);
  expect(schedule!.assignments[0]).toMatchObject({
    date: '2026-07-20', shift: 'morning', stationId, technicianId: null, experimenter: 'נסיין',
  });
});

test('PUT approve with place appends to occupied experimenter cell', async () => {
  const schedule = await prisma.schedule.create({ data: { weekStart: '2026-07-19', status: 'draft' } });
  await prisma.assignment.create({
    data: { scheduleId: schedule.id, date: '2026-07-20', shift: 'morning', stationId, experimenter: 'קיים' },
  });
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId, place: true }));
  const a = await prisma.assignment.findFirst({ where: { scheduleId: schedule.id } });
  expect(a!.experimenter).toBe('קיים, נסיין');
});
