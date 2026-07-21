import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { ADMIN_EMAIL } from '@/lib/config';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';

function jsonReq(url: string, body: unknown): Request {
  return new Request(`http://test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function cookieToken(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.match(/session=([^;]*)/)![1];
}

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.allowedEmail.deleteMany();
});

test('register rejects an email that is not on the allowlist with 403', async () => {
  const res = await register(jsonReq('/x', { name: 'דני', email: 'a@b.com', password: 'password1' }));
  expect(res.status).toBe(403);
  expect(await prisma.technician.count()).toBe(0);
});

test('register creates technician for an allowed email and sets session cookie', async () => {
  await prisma.allowedEmail.create({ data: { email: 'a@b.com' } });
  const res = await register(jsonReq('/x', { name: 'דני', email: 'a@b.com', password: 'password1' }));
  expect(res.status).toBe(200);
  expect((await res.json()).role).toBe('technician');
  const session = await verifySessionToken(cookieToken(res));
  expect(session?.role).toBe('technician');
  expect(session?.name).toBe('דני');
  const tech = await prisma.technician.findUnique({ where: { email: 'a@b.com' } });
  expect(tech).not.toBeNull();
  expect(tech!.isAdmin).toBe(false);
  expect(tech!.passwordHash).not.toBe('password1');
});

test('bootstrap admin email registers without allowlist entry and becomes admin', async () => {
  const res = await register(jsonReq('/x', { name: 'גורגני', email: ADMIN_EMAIL, password: 'password1' }));
  expect(res.status).toBe(200);
  expect((await res.json()).role).toBe('admin');
  const session = await verifySessionToken(cookieToken(res));
  expect(session?.role).toBe('admin');
  expect(session?.userId).toBeDefined();
  const admin = await prisma.technician.findUnique({ where: { email: ADMIN_EMAIL } });
  expect(admin!.isAdmin).toBe(true);
});

test('emails are normalized to lowercase on register and login', async () => {
  await prisma.allowedEmail.create({ data: { email: 'a@b.com' } });
  const res = await register(jsonReq('/x', { name: 'a', email: 'A@B.Com', password: 'password1' }));
  expect(res.status).toBe(200);
  expect(await prisma.technician.findUnique({ where: { email: 'a@b.com' } })).not.toBeNull();
  expect((await login(jsonReq('/x', { email: 'a@B.COM', password: 'password1' }))).status).toBe(200);
});

test('register rejects short password and missing fields', async () => {
  await prisma.allowedEmail.create({ data: { email: 'a@b.com' } });
  expect((await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'short' }))).status).toBe(400);
  expect((await register(jsonReq('/x', { email: 'a@b.com', password: 'password1' }))).status).toBe(400);
  expect((await register(new Request('http://test/x', { method: 'POST' }))).status).toBe(400);
});

test('register rejects duplicate email with 409', async () => {
  await prisma.allowedEmail.create({ data: { email: 'a@b.com' } });
  await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'password1' }));
  const res = await register(jsonReq('/x', { name: 'b', email: 'a@b.com', password: 'password2' }));
  expect(res.status).toBe(409);
});

test('login returns role by isAdmin and fails on bad credentials', async () => {
  await prisma.allowedEmail.create({ data: { email: 'a@b.com' } });
  await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'password1' }));
  await register(jsonReq('/x', { name: 'ג', email: ADMIN_EMAIL, password: 'password2' }));
  const techLogin = await login(jsonReq('/x', { email: 'a@b.com', password: 'password1' }));
  expect(techLogin.status).toBe(200);
  expect((await techLogin.json()).role).toBe('technician');
  const adminLogin = await login(jsonReq('/x', { email: ADMIN_EMAIL, password: 'password2' }));
  expect((await adminLogin.json()).role).toBe('admin');
  expect((await verifySessionToken(cookieToken(adminLogin)))?.role).toBe('admin');
  expect((await login(jsonReq('/x', { email: 'a@b.com', password: 'wrongpass1' }))).status).toBe(401);
  expect((await login(jsonReq('/x', { email: 'no@b.com', password: 'password1' }))).status).toBe(401);
});

test('logout clears the cookie', async () => {
  const res = await logout();
  expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
});
