import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { addDays } from '@/lib/dates';
import { GET, POST, DELETE } from '@/app/api/tester-requests/route';

const DATE = '2026-07-20';

async function req(method: string, role: 'tester' | 'technician' | 'admin', userId: number, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId, role, name: 'נ' });
  return new Request('http://test/api/tester-requests', {
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
  const t = await prisma.technician.create({
    data: { name: 'נסיין', email: 'n@x.com', passwordHash: 'x', role: 'tester' },
  });
  testerId = t.id;
  const s = await prisma.station.create({ data: { name: 'Press 1', position: 0 } });
  stationId = s.id;
});

const VALID = { date: DATE, shift: 'morning', description: 'בדיקת ראשים' };

test('POST creates a pending request and GET lists it with stations', async () => {
  const post = await POST(await req('POST', 'tester', testerId, { ...VALID, stationId, swVersion: '15.2', hwNotes: 'צריך ראש חדש' }));
  expect(post.status).toBe(200);
  const res = await GET(await req('GET', 'tester', testerId));
  const data = await res.json();
  expect(data.requests).toHaveLength(1);
  expect(data.requests[0]).toMatchObject({
    date: DATE, shift: 'morning', stationId, swVersion: '15.2', hwNotes: 'צריך ראש חדש', status: 'pending',
  });
  expect(data.requests[0].station.name).toBe('Press 1');
  expect(data.stations).toEqual([{ id: stationId, name: 'Press 1' }]);
});

test('POST allows request without station (any press)', async () => {
  expect((await POST(await req('POST', 'tester', testerId, VALID))).status).toBe(200);
  const { requests } = await (await GET(await req('GET', 'tester', testerId))).json();
  expect(requests[0].stationId).toBeNull();
});

test('POST requires description, valid date and shift', async () => {
  expect((await POST(await req('POST', 'tester', testerId, { ...VALID, description: '  ' }))).status).toBe(400);
  expect((await POST(await req('POST', 'tester', testerId, { ...VALID, date: 'nope' }))).status).toBe(400);
  expect((await POST(await req('POST', 'tester', testerId, { ...VALID, shift: 'night' }))).status).toBe(400);
  expect((await POST(await req('POST', 'tester', testerId, { ...VALID, stationId: stationId + 999 }))).status).toBe(400);
});

test('POST rejects when week schedule is published', async () => {
  await prisma.schedule.create({ data: { weekStart: '2026-07-19', status: 'published' } });
  expect((await POST(await req('POST', 'tester', testerId, VALID))).status).toBe(409);
});

test('routes require tester session', async () => {
  expect((await GET(await req('GET', 'technician', testerId))).status).toBe(403);
  expect((await POST(await req('POST', 'admin', testerId, VALID))).status).toBe(403);
  expect((await GET(new Request('http://test/api/tester-requests'))).status).toBe(401);
});

test('DELETE cancels own pending request only', async () => {
  await POST(await req('POST', 'tester', testerId, VALID));
  const { requests } = await (await GET(await req('GET', 'tester', testerId))).json();
  const id = requests[0].id;
  expect((await DELETE(await req('DELETE', 'tester', testerId, { id }))).status).toBe(200);
  expect(await prisma.testerRequest.count()).toBe(0);
});

test('DELETE refuses non-pending and foreign requests', async () => {
  const other = await prisma.technician.create({ data: { name: 'ב', email: 'b@x.com', passwordHash: 'x', role: 'tester' } });
  const r = await prisma.testerRequest.create({
    data: { testerId: other.id, date: DATE, shift: 'morning', description: 'x' },
  });
  expect((await DELETE(await req('DELETE', 'tester', testerId, { id: r.id }))).status).toBe(404);
  const approved = await prisma.testerRequest.create({
    data: { testerId, date: DATE, shift: 'morning', description: 'x', status: 'approved' },
  });
  expect((await DELETE(await req('DELETE', 'tester', testerId, { id: approved.id }))).status).toBe(400);
});

test('GET all lists upcoming requests of every tester with names, past excluded', async () => {
  const other = await prisma.technician.create({
    data: { name: 'נסיין ב', email: 'b2@x.com', passwordHash: 'x', role: 'tester' },
  });
  const today = new Date().toISOString().slice(0, 10);
  await prisma.testerRequest.createMany({
    data: [
      { testerId, date: today, shift: 'morning', description: 'mine' },
      { testerId: other.id, date: addDays(today, 2), shift: 'evening', description: 'theirs' },
      { testerId: other.id, date: addDays(today, -3), shift: 'morning', description: 'old' },
    ],
  });
  const { all } = await (await GET(await req('GET', 'tester', testerId))).json();
  expect(all).toHaveLength(2);
  expect(all.map((r: { tester: { name: string } }) => r.tester.name).sort()).toEqual(['נסיין', 'נסיין ב']);
  expect(all[0].date <= all[1].date).toBe(true);
});
