import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as listStations, POST as createStation, PUT as updateStation, DELETE as deleteStation } from '@/app/api/admin/stations/route';

async function adminReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function techReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 1, role: 'technician', name: 'טק' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(async () => {
  await prisma.assignment.deleteMany();
  await prisma.station.deleteMany();
  await prisma.schedule.deleteMany();
});

test('rejects non-admin sessions', async () => {
  expect((await listStations(await techReq('GET', '/x'))).status).toBe(403);
  expect((await createStation(await techReq('POST', '/x', { name: 'A' }))).status).toBe(403);
  expect((await updateStation(await techReq('PUT', '/x', { id: 1, name: 'A' }))).status).toBe(403);
  expect((await deleteStation(await techReq('DELETE', '/x', { id: 1 }))).status).toBe(403);
});

test('creates stations with incrementing position and lists them ordered', async () => {
  expect((await createStation(await adminReq('POST', '/x', { name: 'עמדה א' }))).status).toBe(200);
  expect((await createStation(await adminReq('POST', '/x', { name: 'עמדה ב' }))).status).toBe(200);
  const res = await listStations(await adminReq('GET', '/x'));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.stations).toHaveLength(2);
  expect(data.stations.map((s: { name: string }) => s.name)).toEqual(['עמדה א', 'עמדה ב']);
  expect(data.stations[0].position).toBeLessThan(data.stations[1].position);
  expect(data.stations.every((s: { active: boolean }) => s.active === true)).toBe(true);
});

test('rejects create with empty name', async () => {
  expect((await createStation(await adminReq('POST', '/x', { name: '' }))).status).toBe(400);
  expect((await createStation(await adminReq('POST', '/x', {}))).status).toBe(400);
});

test('updates name, active flag, and position', async () => {
  await createStation(await adminReq('POST', '/x', { name: 'עמדה א' }));
  const list = await (await listStations(await adminReq('GET', '/x'))).json();
  const id = list.stations[0].id;
  const res = await updateStation(await adminReq('PUT', '/x', { id, name: 'עמדה חדשה', active: false, position: 5 }));
  expect(res.status).toBe(200);
  const updated = await prisma.station.findUnique({ where: { id } });
  expect(updated).toMatchObject({ name: 'עמדה חדשה', active: false, position: 5 });
});

test('list includes inactive stations with active:false flag', async () => {
  await createStation(await adminReq('POST', '/x', { name: 'עמדה א' }));
  const list = await (await listStations(await adminReq('GET', '/x'))).json();
  const id = list.stations[0].id;
  await updateStation(await adminReq('PUT', '/x', { id, active: false }));
  const after = await (await listStations(await adminReq('GET', '/x'))).json();
  expect(after.stations).toHaveLength(1);
  expect(after.stations[0].active).toBe(false);
});

test('update on unknown id returns 404', async () => {
  expect((await updateStation(await adminReq('PUT', '/x', { id: 999999, name: 'x' }))).status).toBe(404);
});

test('deletes a station never referenced by an assignment', async () => {
  await createStation(await adminReq('POST', '/x', { name: 'עמדה א' }));
  const list = await (await listStations(await adminReq('GET', '/x'))).json();
  const id = list.stations[0].id;
  const res = await deleteStation(await adminReq('DELETE', '/x', { id }));
  expect(res.status).toBe(200);
  expect(await prisma.station.findUnique({ where: { id } })).toBeNull();
});

test('refuses to delete a station referenced by an assignment (409)', async () => {
  await createStation(await adminReq('POST', '/x', { name: 'עמדה א' }));
  const list = await (await listStations(await adminReq('GET', '/x'))).json();
  const id = list.stations[0].id;
  const schedule = await prisma.schedule.create({ data: { weekStart: '2026-07-19' } });
  await prisma.assignment.create({
    data: { scheduleId: schedule.id, date: '2026-07-19', shift: 'morning', stationId: id },
  });
  const res = await deleteStation(await adminReq('DELETE', '/x', { id }));
  expect(res.status).toBe(409);
  expect(await prisma.station.findUnique({ where: { id } })).not.toBeNull();
});
