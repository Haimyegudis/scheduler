import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET, PUT } from '@/app/api/admin/tester-requests/route';

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
