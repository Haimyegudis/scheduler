import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getPublicKey } from '@/app/api/push/public-key/route';
import { POST as subscribe, DELETE as unsubscribe } from '@/app/api/push/subscribe/route';

const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
let savedEnv: Record<string, string | undefined>;

function setVapidEnv() {
  process.env.VAPID_PUBLIC_KEY = 'BDmjeTtdFZUV0r1lwPKspaef5_qvH0bqW9FJMJWEy7gde_8iEW1IdYjyogQGoJULJYGQ6xBC6RUlkmzJ6q-2GB4';
  process.env.VAPID_PRIVATE_KEY = '_6g-1L-wi9P2ewaS4iiCyatUrgv-7iG7-cY2Pa9q_WE';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
}

function clearVapidEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

async function techReq(method: string, techId: number, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request('http://test/x', {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function anonReq(method: string, body?: unknown): Promise<Request> {
  return new Request('http://test/x', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let techId: number;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  const t = await prisma.technician.create({ data: { name: 'טכנאי', email: 'push@x.com', passwordHash: 'x' } });
  techId = t.id;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  vi.restoreAllMocks();
});

test('public-key: rejects unauthenticated requests', async () => {
  setVapidEnv();
  const res = await getPublicKey(await anonReq('GET'));
  expect(res.status).toBe(401);
});

test('public-key: returns 503 when VAPID env vars are missing', async () => {
  clearVapidEnv();
  const res = await getPublicKey(await techReq('GET', techId));
  expect(res.status).toBe(503);
  const data = await res.json();
  expect(typeof data.error).toBe('string');
  expect(data.error.length).toBeGreaterThan(0);
});

test('public-key: returns the configured public key for a logged-in user', async () => {
  setVapidEnv();
  const res = await getPublicKey(await techReq('GET', techId));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.key).toBe(process.env.VAPID_PUBLIC_KEY);
});

test('subscribe: rejects unauthenticated requests', async () => {
  setVapidEnv();
  const res = await subscribe(
    await anonReq('POST', { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
  );
  expect(res.status).toBe(401);
});

test('subscribe: returns 503 when VAPID env vars are missing', async () => {
  clearVapidEnv();
  const res = await subscribe(
    await techReq('POST', techId, { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
  );
  expect(res.status).toBe(503);
});

test('subscribe: rejects malformed subscription payloads', async () => {
  setVapidEnv();
  expect((await subscribe(await techReq('POST', techId, {}))).status).toBe(400);
  expect(
    (await subscribe(await techReq('POST', techId, { endpoint: 'https://push.example/1' }))).status
  ).toBe(400);
  expect(
    (await subscribe(await techReq('POST', techId, { endpoint: '', keys: { p256dh: 'a', auth: 'b' } }))).status
  ).toBe(400);
});

test('subscribe: rejects a non-https endpoint and oversized fields', async () => {
  setVapidEnv();
  expect(
    (
      await subscribe(
        await techReq('POST', techId, { endpoint: 'http://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
      )
    ).status
  ).toBe(400);
  expect(
    (
      await subscribe(
        await techReq('POST', techId, {
          endpoint: 'https://push.example/1',
          keys: { p256dh: 'a'.repeat(513), auth: 'b' },
        })
      )
    ).status
  ).toBe(400);
  expect(await prisma.pushSubscription.count()).toBe(0);
});

test('subscribe: creates a subscription row for the session user', async () => {
  setVapidEnv();
  const res = await subscribe(
    await techReq('POST', techId, { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
  );
  expect(res.status).toBe(200);
  const rows = await prisma.pushSubscription.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    endpoint: 'https://push.example/1',
    p256dh: 'a',
    auth: 'b',
    technicianId: techId,
  });
});

test('subscribe: upserts by endpoint instead of duplicating', async () => {
  setVapidEnv();
  await subscribe(await techReq('POST', techId, { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } }));
  await subscribe(await techReq('POST', techId, { endpoint: 'https://push.example/1', keys: { p256dh: 'a2', auth: 'b2' } }));
  const rows = await prisma.pushSubscription.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ p256dh: 'a2', auth: 'b2' });
});

test('unsubscribe: rejects unauthenticated requests', async () => {
  const res = await unsubscribe(await anonReq('DELETE', { endpoint: 'https://push.example/1' }));
  expect(res.status).toBe(401);
});

test('unsubscribe: rejects missing endpoint', async () => {
  const res = await unsubscribe(await techReq('DELETE', techId, {}));
  expect(res.status).toBe(400);
});

test('unsubscribe: removes the matching subscription for the session user', async () => {
  setVapidEnv();
  await subscribe(await techReq('POST', techId, { endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } }));
  expect(await prisma.pushSubscription.count()).toBe(1);
  const res = await unsubscribe(await techReq('DELETE', techId, { endpoint: 'https://push.example/1' }));
  expect(res.status).toBe(200);
  expect(await prisma.pushSubscription.count()).toBe(0);
});

test('unsubscribe: does not remove another user\'s subscription with the same endpoint scoping', async () => {
  setVapidEnv();
  const other = await prisma.technician.create({ data: { name: 'אחר', email: 'other@x.com', passwordHash: 'x' } });
  await subscribe(await techReq('POST', other.id, { endpoint: 'https://push.example/2', keys: { p256dh: 'a', auth: 'b' } }));
  const res = await unsubscribe(await techReq('DELETE', techId, { endpoint: 'https://push.example/2' }));
  expect(res.status).toBe(200);
  expect(await prisma.pushSubscription.count()).toBe(1);
});
