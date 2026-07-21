import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET } from '@/app/api/my-vacations/route';

const YEAR = new Date().getUTCFullYear();

async function techRequest(techId: number): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request('http://test/api/my-vacations', { headers: { cookie: `session=${token}` } });
}

async function adminRequest(techId: number): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'admin', name: 'מנהל' });
  return new Request('http://test/api/my-vacations', { headers: { cookie: `session=${token}` } });
}

let techId: number;
let otherTechId: number;

beforeEach(async () => {
  await prisma.technician.deleteMany();
  const t = await prisma.technician.create({ data: { name: 'a', email: 'a@b.com', passwordHash: 'x' } });
  techId = t.id;
  const other = await prisma.technician.create({ data: { name: 'b', email: 'b@b.com', passwordHash: 'x' } });
  otherTechId = other.id;
});

test('requires technician session (401 with no session)', async () => {
  const res = await GET(new Request('http://test/api/my-vacations'));
  expect(res.status).toBe(401);
  expect((await res.json()).error).toBe('נדרשת התחברות');
});

test('rejects admin role (401, technician-only)', async () => {
  const res = await GET(await adminRequest(techId));
  expect(res.status).toBe(401);
});

test('returns current year, empty summary and absences when technician has none', async () => {
  const res = await GET(await techRequest(techId));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.year).toBe(YEAR);
  expect(data.summary).toEqual({ vacation: 0, sick: 0, miluim: 0, other: 0, offMarked: 0, total: 0 });
  expect(data.absences).toEqual([]);
});

test('counts absence days clipped to current year, plus off-marked days, ignores other technicians', async () => {
  // Fully inside year: 3-day vacation
  const v = await prisma.absence.create({
    data: { technicianId: techId, startDate: `${YEAR}-03-01`, endDate: `${YEAR}-03-03`, type: 'vacation' },
  });
  // Crosses into next year: clip sick days to Dec 31
  const s = await prisma.absence.create({
    data: { technicianId: techId, startDate: `${YEAR}-12-30`, endDate: `${YEAR + 1}-01-05`, type: 'sick' },
  });
  // Belongs to another technician entirely — must not be counted
  await prisma.absence.create({
    data: { technicianId: otherTechId, startDate: `${YEAR}-03-01`, endDate: `${YEAR}-03-03`, type: 'vacation' },
  });
  await prisma.constraint.createMany({
    data: [
      { technicianId: techId, date: `${YEAR}-04-01`, value: 'off' },
      { technicianId: techId, date: `${YEAR}-04-02`, value: 'off' },
      { technicianId: techId, date: `${YEAR}-04-03`, value: 'morning' },
      { technicianId: otherTechId, date: `${YEAR}-04-01`, value: 'off' },
    ],
  });

  const res = await GET(await techRequest(techId));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.summary).toEqual({ vacation: 3, sick: 2, miluim: 0, other: 0, offMarked: 2, total: 5 });
  expect(data.absences).toHaveLength(2);
  expect(data.absences).toEqual(
    expect.arrayContaining([
      { id: v.id, startDate: `${YEAR}-03-01`, endDate: `${YEAR}-03-03`, type: 'vacation' },
      { id: s.id, startDate: `${YEAR}-12-30`, endDate: `${YEAR + 1}-01-05`, type: 'sick' },
    ])
  );
});

test('clips absence that starts before the current year to Jan 1', async () => {
  await prisma.absence.create({
    data: { technicianId: techId, startDate: `${YEAR - 1}-12-29`, endDate: `${YEAR}-01-02`, type: 'miluim' },
  });
  const res = await GET(await techRequest(techId));
  const data = await res.json();
  expect(data.summary).toMatchObject({ miluim: 2, total: 2 });
});

test('does not accept a year query parameter override', async () => {
  await prisma.absence.create({
    data: { technicianId: techId, startDate: `2020-01-01`, endDate: `2020-01-05`, type: 'vacation' },
  });
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  const res = await GET(new Request('http://test/api/my-vacations?year=2020', {
    headers: { cookie: `session=${token}` },
  }));
  const data = await res.json();
  expect(data.year).toBe(YEAR);
  expect(data.summary.vacation).toBe(0);
});
