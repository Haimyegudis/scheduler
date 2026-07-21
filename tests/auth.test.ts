import { test, expect } from 'vitest';
import { createSessionToken, verifySessionToken, sessionCookie, clearSessionCookie, getSession } from '@/lib/auth';

test('round-trips a technician session', async () => {
  const token = await createSessionToken({ userId: 7, role: 'technician', name: 'דני' });
  const session = await verifySessionToken(token);
  expect(session).toEqual({ userId: 7, role: 'technician', name: 'דני' });
});

test('round-trips an admin session without userId', async () => {
  const token = await createSessionToken({ role: 'admin', name: 'מנהל' });
  const session = await verifySessionToken(token);
  expect(session?.role).toBe('admin');
  expect(session?.userId).toBeUndefined();
});

test('rejects a tampered token', async () => {
  const token = await createSessionToken({ userId: 1, role: 'technician', name: 'x' });
  expect(await verifySessionToken(token + 'x')).toBeNull();
  expect(await verifySessionToken('garbage')).toBeNull();
});

test('sessionCookie is httpOnly and clearSessionCookie expires', () => {
  expect(sessionCookie('abc')).toContain('session=abc');
  expect(sessionCookie('abc')).toContain('HttpOnly');
  expect(clearSessionCookie()).toContain('Max-Age=0');
});

test('getSession reads the cookie header from a Request', async () => {
  const token = await createSessionToken({ userId: 3, role: 'technician', name: 'רון' });
  const req = new Request('http://test/', { headers: { cookie: `other=1; session=${token}` } });
  expect((await getSession(req))?.userId).toBe(3);
  expect(await getSession(new Request('http://test/'))).toBeNull();
});

test('createSessionToken throws when JWT_SECRET is missing', async () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    await expect(createSessionToken({ role: 'admin', name: 'x' })).rejects.toThrow('JWT_SECRET');
  } finally {
    process.env.JWT_SECRET = saved;
  }
});

test('cookies add Secure flag only in production', () => {
  expect(sessionCookie('abc')).not.toContain('Secure'); // NODE_ENV=test here
});

test('cookies include Secure flag in production', () => {
  const saved = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = 'production';
  try {
    expect(sessionCookie('abc')).toContain('; Secure');
    expect(clearSessionCookie()).toContain('; Secure');
  } finally {
    (process.env as Record<string, string>).NODE_ENV = saved!;
  }
});
