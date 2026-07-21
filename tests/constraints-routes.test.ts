import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET, PUT } from '@/app/api/constraints/route';

const WEEK = '2026-07-19';

async function techRequest(method: string, url: string, techId: number, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

let techId: number;

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  const t = await prisma.technician.create({ data: { name: 'a', email: 'a@b.com', passwordHash: 'x' } });
  techId = t.id;
});

test('GET returns empty constraints and week flags', async () => {
  const res = await GET(await techRequest('GET', `/api/constraints?weekStart=${WEEK}`, techId));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual({ constraints: {}, includeFriday: false, published: false, absences: {} });
});

test('PUT saves a constraint and GET returns it', async () => {
  const put = await PUT(await techRequest('PUT', '/api/constraints', techId, { date: '2026-07-20', value: 'morning' }));
  expect(put.status).toBe(200);
  const res = await GET(await techRequest('GET', `/api/constraints?weekStart=${WEEK}`, techId));
  expect((await res.json()).constraints['2026-07-20']).toBe('morning');
});

test('PUT overwrites an existing constraint (upsert)', async () => {
  await PUT(await techRequest('PUT', '/x', techId, { date: '2026-07-20', value: 'morning' }));
  await PUT(await techRequest('PUT', '/x', techId, { date: '2026-07-20', value: 'off' }));
  const res = await GET(await techRequest('GET', `/api/constraints?weekStart=${WEEK}`, techId));
  expect((await res.json()).constraints['2026-07-20']).toBe('off');
});

test('PUT rejects invalid value or date', async () => {
  expect((await PUT(await techRequest('PUT', '/x', techId, { date: '2026-07-20', value: 'night' }))).status).toBe(400);
  expect((await PUT(await techRequest('PUT', '/x', techId, { value: 'morning' }))).status).toBe(400);
});

test('PUT rejects when week schedule is published', async () => {
  await prisma.schedule.create({ data: { weekStart: WEEK, status: 'published' } });
  const res = await PUT(await techRequest('PUT', '/x', techId, { date: '2026-07-20', value: 'morning' }));
  expect(res.status).toBe(409);
});

test('requires technician session', async () => {
  expect((await GET(new Request(`http://test/api/constraints?weekStart=${WEEK}`))).status).toBe(401);
});
