import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { ADMIN_EMAIL } from '@/lib/config';
import { POST as register } from '@/app/api/auth/register/route';

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

function jsonReq(body: unknown): Request {
  return new Request('http://test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.allowedEmail.deleteMany();
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await prisma.pushSubscription.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.allowedEmail.deleteMany();
  vi.restoreAllMocks();
});

test('registering a new user notifies admin subscriptions only, not other technicians', async () => {
  setVapidEnv();
  const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

  const admin = await prisma.technician.create({
    data: { name: 'מנהל קיים', email: 'admin@x.com', passwordHash: 'x', isAdmin: true },
  });
  await prisma.pushSubscription.create({
    data: { technicianId: admin.id, endpoint: 'https://push.example/admin', p256dh: 'a', auth: 'b' },
  });
  const otherTech = await prisma.technician.create({
    data: { name: 'טכנאי אחר', email: 'tech@x.com', passwordHash: 'x', isAdmin: false },
  });
  await prisma.pushSubscription.create({
    data: { technicianId: otherTech.id, endpoint: 'https://push.example/tech', p256dh: 'a', auth: 'b' },
  });
  await prisma.allowedEmail.create({ data: { email: 'newbie@x.com' } });

  const res = await register(jsonReq({ name: 'חדש', email: 'newbie@x.com', password: 'password1' }));
  expect(res.status).toBe(200);

  expect(sendSpy).toHaveBeenCalledTimes(1);
  const [subscriptionArg] = sendSpy.mock.calls[0];
  expect(subscriptionArg.endpoint).toBe('https://push.example/admin');
});

test('bootstrap admin registering for the first time does not get a self-notification', async () => {
  setVapidEnv();
  const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

  // No admins exist yet; ADMIN_EMAIL is about to become the very first one.
  const res = await register(jsonReq({ name: 'בוט', email: ADMIN_EMAIL, password: 'password1' }));
  expect(res.status).toBe(200);
  expect((await res.json()).role).toBe('admin');
  expect(sendSpy).not.toHaveBeenCalled();
});

test('registration succeeds and skips push entirely when VAPID is not configured', async () => {
  clearVapidEnv();
  const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);

  await prisma.allowedEmail.create({ data: { email: 'newbie2@x.com' } });
  const res = await register(jsonReq({ name: 'חדש', email: 'newbie2@x.com', password: 'password1' }));
  expect(res.status).toBe(200);
  expect(sendSpy).not.toHaveBeenCalled();
});

test('registration succeeds even if push delivery to the admin fails', async () => {
  setVapidEnv();
  vi.spyOn(webpush, 'sendNotification').mockRejectedValue(new Error('network down'));

  const admin = await prisma.technician.create({
    data: { name: 'מנהל', email: 'admin2@x.com', passwordHash: 'x', isAdmin: true },
  });
  await prisma.pushSubscription.create({
    data: { technicianId: admin.id, endpoint: 'https://push.example/admin2', p256dh: 'a', auth: 'b' },
  });
  await prisma.allowedEmail.create({ data: { email: 'newbie3@x.com' } });

  const res = await register(jsonReq({ name: 'חדש', email: 'newbie3@x.com', password: 'password1' }));
  expect(res.status).toBe(200);
});
