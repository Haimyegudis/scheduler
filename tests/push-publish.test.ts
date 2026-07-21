import { test, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { POST as generate } from '@/app/api/admin/schedule/generate/route';
import { POST as publish } from '@/app/api/admin/schedule/publish/route';

const WEEK = '2026-08-02';
const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
let savedEnv: Record<string, string | undefined>;

async function adminReq(method: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request('http://test/x', {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
  await prisma.station.create({ data: { name: 'עמדה', position: 1 } });
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.station.deleteMany();
});

test('publish succeeds with no push subscriptions and VAPID configured', async () => {
  process.env.VAPID_PUBLIC_KEY = 'BDmjeTtdFZUV0r1lwPKspaef5_qvH0bqW9FJMJWEy7gde_8iEW1IdYjyogQGoJULJYGQ6xBC6RUlkmzJ6q-2GB4';
  process.env.VAPID_PRIVATE_KEY = '_6g-1L-wi9P2ewaS4iiCyatUrgv-7iG7-cY2Pa9q_WE';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';

  await generate(await adminReq('POST', { weekStart: WEEK, includeFriday: false }));
  const res = await publish(await adminReq('POST', { weekStart: WEEK }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK } });
  expect(schedule!.status).toBe('published');
});

test('publish succeeds when VAPID env vars are missing entirely', async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;

  await generate(await adminReq('POST', { weekStart: WEEK, includeFriday: false }));
  const res = await publish(await adminReq('POST', { weekStart: WEEK }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK } });
  expect(schedule!.status).toBe('published');
});

test('publish succeeds even with a stale/invalid push subscription in the DB', async () => {
  process.env.VAPID_PUBLIC_KEY = 'BDmjeTtdFZUV0r1lwPKspaef5_qvH0bqW9FJMJWEy7gde_8iEW1IdYjyogQGoJULJYGQ6xBC6RUlkmzJ6q-2GB4';
  process.env.VAPID_PRIVATE_KEY = '_6g-1L-wi9P2ewaS4iiCyatUrgv-7iG7-cY2Pa9q_WE';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';

  const t = await prisma.technician.create({ data: { name: 'טכנאי', email: 'sub@x.com', passwordHash: 'x' } });
  await prisma.pushSubscription.create({
    data: { technicianId: t.id, endpoint: 'https://push.example/does-not-exist', p256dh: 'bad', auth: 'bad' },
  });

  await generate(await adminReq('POST', { weekStart: WEEK, includeFriday: false }));
  const res = await publish(await adminReq('POST', { weekStart: WEEK }));
  expect(res.status).toBe(200);
});
