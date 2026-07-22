import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { POST as addMyAbsence, DELETE as deleteMyAbsence } from '@/app/api/my-absences/route';

async function techReq(method: string, techId: number, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request('http://test/api/my-absences', {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

let myId: number;
let otherId: number;

beforeEach(async () => {
  await prisma.technician.deleteMany();
  const me = await prisma.technician.create({
    data: { name: 'אני', email: 'self-abs-me@x.com', passwordHash: 'x' },
  });
  const other = await prisma.technician.create({
    data: { name: 'אחר', email: 'self-abs-other@x.com', passwordHash: 'x' },
  });
  myId = me.id;
  otherId = other.id;
});

test('technician can create an absence for themselves only', async () => {
  const res = await addMyAbsence(await techReq('POST', myId, {
    startDate: '2026-08-02',
    endDate: '2026-08-04',
    type: 'vacation',
    technicianId: otherId, // must be ignored — session wins
  }));
  expect(res.status).toBe(200);
  const rows = await prisma.absence.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0].technicianId).toBe(myId);
});

test('rejects invalid type, dates, and reversed range with 400', async () => {
  expect((await addMyAbsence(await techReq('POST', myId, { startDate: '2026-08-02', endDate: '2026-08-04', type: 'party' }))).status).toBe(400);
  expect((await addMyAbsence(await techReq('POST', myId, { startDate: 'bad', endDate: '2026-08-04', type: 'sick' }))).status).toBe(400);
  expect((await addMyAbsence(await techReq('POST', myId, { startDate: '2026-08-05', endDate: '2026-08-04', type: 'sick' }))).status).toBe(400);
});

test('rejects non-technician sessions with 401', async () => {
  const adminToken = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  const adminReq = new Request('http://test/api/my-absences', {
    method: 'POST',
    headers: { cookie: `session=${adminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: '2026-08-02', endDate: '2026-08-04', type: 'sick' }),
  });
  expect((await addMyAbsence(adminReq)).status).toBe(401);
  expect((await addMyAbsence(new Request('http://test/x', { method: 'POST' }))).status).toBe(401);
});

test('delete removes own record but never another technician\'s', async () => {
  const mine = await prisma.absence.create({
    data: { technicianId: myId, startDate: '2026-08-02', endDate: '2026-08-02', type: 'sick' },
  });
  const theirs = await prisma.absence.create({
    data: { technicianId: otherId, startDate: '2026-08-03', endDate: '2026-08-03', type: 'sick' },
  });

  expect((await deleteMyAbsence(await techReq('DELETE', myId, { id: theirs.id }))).status).toBe(200);
  expect(await prisma.absence.findUnique({ where: { id: theirs.id } })).not.toBeNull(); // untouched

  expect((await deleteMyAbsence(await techReq('DELETE', myId, { id: mine.id }))).status).toBe(200);
  expect(await prisma.absence.findUnique({ where: { id: mine.id } })).toBeNull();
});
