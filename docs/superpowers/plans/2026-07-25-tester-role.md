# Tester Role & Machine Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third user role, `tester`, that can only view the published schedule and submit machine-shift requests (date, shift, optional press, SW/HW, required description); admin reviews requests on the schedule board and approves into the assignment's `experimenter` slot, with a warning when the tester would be alone on a press.

**Architecture:** Next.js 15 App Router + Prisma. `Technician.role` string column (`technician | admin | tester`) alongside the existing `isAdmin` boolean (kept in sync; push targeting and old checks keep working). New `TesterRequest` table. Tester-facing API `/api/tester-requests` (CRUD own), admin API `/api/admin/tester-requests` (list by week, approve/reject). Approval is client-driven on the admin board: set the cell's `experimenter` to the tester's name, save the draft, then mark the request approved server-side. Requests link to placement via `assignedStationId` (NOT an assignment FK — the save flow deletes and recreates all assignment rows, so assignment IDs are unstable).

**Tech Stack:** Next.js 15, React 19, Prisma 6, SQLite (dev/test) / Neon Postgres (prod), Vitest, Tailwind 4, web-push.

**Spec:** `docs/superpowers/specs/2026-07-25-tester-role-design.md`. Deviation: spec's `assignmentId` field is replaced by `assignedStationId` (reason above).

## Global Constraints

- `prisma/schema.prisma` datasource provider MUST be `sqlite` for local dev/tests; production deploys flip to `postgresql` (see README "Database provider"). Currently checked in as `postgresql` — flip to `sqlite` in Task 1 and leave it that way (deploy flow flips it).
- Server API error strings are Hebrew; every new one gets an English entry in `apiErrorMap` in `src/lib/i18n-dict.ts`.
- Every new UI string gets a key in BOTH the `he` and `en` dicts in `src/lib/i18n-dict.ts` (`en` is `Record<keyof typeof he, string>` — a missing key is a type error).
- Tests: `npm test` (vitest, `fileParallelism: false`, sqlite `file:./test.db`). Route tests import route handlers directly and build `Request` objects with a session cookie (see `tests/constraints-routes.test.ts` pattern).
- Push notifications are best-effort: never let a push failure fail the request (existing `push.ts` helpers already swallow errors).
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Schema — role column + TesterRequest model + Neon migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `neon-migrate-tester-role.sql`

**Interfaces:**
- Produces: `Technician.role: string` (default `"technician"`), `prisma.testerRequest` client with fields `id, testerId, date, shift, stationId?, swVersion?, hwNotes?, description, status, assignedStationId?, createdAt`.

- [ ] **Step 1: Flip provider to sqlite and add schema changes**

In `prisma/schema.prisma`, change the datasource block:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Add `role` + relation to `Technician` (after `isAdmin`):

```prisma
  isAdmin           Boolean            @default(false)
  role              String             @default("technician")
```

and add to `Technician`'s relation list:

```prisma
  testerRequests    TesterRequest[]
```

Add to `Station`'s relation list:

```prisma
  testerRequests TesterRequest[]
```

Add new model at the end of the file:

```prisma
model TesterRequest {
  id                Int        @id @default(autoincrement())
  testerId          Int
  tester            Technician @relation(fields: [testerId], references: [id], onDelete: Cascade)
  date              String
  shift             String
  stationId         Int?
  station           Station?   @relation(fields: [stationId], references: [id])
  swVersion         String?
  hwNotes           String?
  description       String
  status            String     @default("pending")
  assignedStationId Int?
  createdAt         DateTime   @default(now())
}
```

- [ ] **Step 2: Regenerate client against dev db**

Run: `npx prisma db push` (uses `.env` dev DATABASE_URL) — if no local `.env`, run with `DATABASE_URL=file:./prisma/dev.db`. Then `npx prisma generate`.
Expected: no errors; client has `prisma.testerRequest`.

- [ ] **Step 3: Write the production migration**

Create `neon-migrate-tester-role.sql`:

```sql
-- Tester role + machine requests. Run against Neon before deploying the tester-role build.
ALTER TABLE "Technician" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'technician';
UPDATE "Technician" SET "role" = 'admin' WHERE "isAdmin" = true AND "role" <> 'admin';

CREATE TABLE IF NOT EXISTS "TesterRequest" (
  "id" SERIAL PRIMARY KEY,
  "testerId" INTEGER NOT NULL REFERENCES "Technician"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  "stationId" INTEGER REFERENCES "Station"("id"),
  "swVersion" TEXT,
  "hwNotes" TEXT,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "assignedStationId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: all existing tests pass (global-setup re-pushes schema to `file:./test.db`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma neon-migrate-tester-role.sql
git commit -m "feat: add tester role column and TesterRequest model"
```

---

### Task 2: Session + auth role plumbing

**Files:**
- Modify: `src/lib/auth.ts:5` (Session.role union)
- Modify: `src/app/api/auth/login/route.ts:13`
- Modify: `src/app/api/auth/register/route.ts:29,37`
- Test: `tests/auth-routes.test.ts` (add cases)

**Interfaces:**
- Produces: `Session.role: 'technician' | 'admin' | 'tester'`; helper `sessionRoleOf(tech: { isAdmin: boolean; role: string }): Session['role']` exported from `src/lib/auth.ts`.
- Consumes: `Technician.role` from Task 1.

- [ ] **Step 1: Write failing tests**

Append to `tests/auth-routes.test.ts` (match that file's existing helpers/imports; it imports the login/register handlers):

```ts
test('login returns tester role for a tester account', async () => {
  await prisma.technician.create({
    data: { name: 'נסיין', email: 'tester@x.com', passwordHash: await bcrypt.hash('password1', 10), role: 'tester' },
  });
  const res = await login(new Request('http://test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'tester@x.com', password: 'password1' }),
  }));
  expect(res.status).toBe(200);
  expect((await res.json()).role).toBe('tester');
});

test('login returns admin role when role column says admin even if isAdmin flag is false', async () => {
  await prisma.technician.create({
    data: { name: 'א', email: 'roleadmin@x.com', passwordHash: await bcrypt.hash('password1', 10), role: 'admin' },
  });
  const res = await login(new Request('http://test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'roleadmin@x.com', password: 'password1' }),
  }));
  expect((await res.json()).role).toBe('admin');
});
```

If `bcrypt` isn't imported in that test file, add `import bcrypt from 'bcryptjs';`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: FAIL — login returns `technician` for the tester account.

- [ ] **Step 3: Implement**

`src/lib/auth.ts` — change the union and add the helper:

```ts
export interface Session {
  userId?: number;
  role: 'technician' | 'admin' | 'tester';
  name: string;
}

// Single source of truth for mapping a Technician row to a session role.
// isAdmin is kept for backward compatibility (push targeting, old rows).
export function sessionRoleOf(tech: { isAdmin: boolean; role: string }): Session['role'] {
  if (tech.isAdmin || tech.role === 'admin') return 'admin';
  return tech.role === 'tester' ? 'tester' : 'technician';
}
```

`src/app/api/auth/login/route.ts` — replace line 13:

```ts
  const role = sessionRoleOf(tech);
```

(import `sessionRoleOf` from `@/lib/auth`).

`src/app/api/auth/register/route.ts` — in the `create` data add `role: isBootstrapAdmin ? 'admin' : 'technician'`, and replace the `const role = ...` line with `const role = sessionRoleOf(tech);` (same import).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/login/route.ts src/app/api/auth/register/route.ts tests/auth-routes.test.ts
git commit -m "feat: tester session role derived from Technician.role"
```

---

### Task 3: Users admin API + users page role selector

**Files:**
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/admin/users/AdminUsersClient.tsx`
- Modify: `src/lib/i18n-dict.ts` (keys below)
- Test: `tests/admin-routes.test.ts` (add cases; existing `isAdmin` PUT cases keep passing)

**Interfaces:**
- Produces: `GET /api/admin/users` → `users: [{ id, name, email, isAdmin, role }]`; `PUT /api/admin/users` accepts `{ userId, role: 'technician'|'tester'|'admin' }` (new) OR legacy `{ userId, isAdmin: boolean }`; both keep `isAdmin === (role === 'admin')` in sync.
- Consumes: `sessionRoleOf` semantics from Task 2.

- [ ] **Step 1: Write failing tests**

Append to `tests/admin-routes.test.ts`:

```ts
test('users PUT accepts role param and syncs isAdmin', async () => {
  const me = await prisma.technician.create({
    data: { name: 'אני2', email: 'me2@x.com', passwordHash: 'x', isAdmin: true },
  });
  const target = techIds[0];
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: target, role: 'tester' }, me.id))).status).toBe(200);
  let row = await prisma.technician.findUnique({ where: { id: target } });
  expect(row!.role).toBe('tester');
  expect(row!.isAdmin).toBe(false);
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: target, role: 'admin' }, me.id))).status).toBe(200);
  row = await prisma.technician.findUnique({ where: { id: target } });
  expect(row!.role).toBe('admin');
  expect(row!.isAdmin).toBe(true);
  expect((await setUserAdmin(await adminReq('PUT', '/x', { userId: target, role: 'boss' }, me.id))).status).toBe(400);
});

test('users GET includes role', async () => {
  const res = await listUsers(await adminReq('GET', '/x'));
  const { users } = await res.json();
  expect(users[0]).toHaveProperty('role');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/admin-routes.test.ts`
Expected: FAIL (role ignored / missing).

- [ ] **Step 3: Implement API**

`src/app/api/admin/users/route.ts`:
- GET: add `role: true` to the `select`.
- PUT: replace body handling with:

```ts
  const body = (await req.json().catch(() => ({}))) as { userId?: number; isAdmin?: boolean; role?: string };
  const { userId } = body;
  const role =
    typeof body.role === 'string' ? body.role : typeof body.isAdmin === 'boolean' ? (body.isAdmin ? 'admin' : 'technician') : undefined;
  if (typeof userId !== 'number' || !role || !['technician', 'tester', 'admin'].includes(role)) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  if (userId === session.userId) {
    return Response.json({ error: 'לא ניתן לשנות את ההרשאה של עצמך' }, { status: 400 });
  }
  const user = await prisma.technician.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  await prisma.technician.update({ where: { id: userId }, data: { role, isAdmin: role === 'admin' } });
  return Response.json({ ok: true });
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/admin-routes.test.ts`
Expected: PASS, including the pre-existing `isAdmin`-body test.

- [ ] **Step 5: i18n keys**

In `src/lib/i18n-dict.ts` add to `he` (near `adminCol`) and mirror in `en`:

```ts
  roleCol: 'תפקיד',                  // en: 'Role'
  roleTechnician: 'עובד',            // en: 'Technician'
  roleTester: 'נסיין',               // en: 'Tester'
  roleAdmin: 'מנהל',                 // en: 'Admin'
```

- [ ] **Step 6: Users page role dropdown**

`src/app/admin/users/AdminUsersClient.tsx`:
- `interface User` → add `role: string`.
- Replace the `adminCol` `<th>` with `{t('roleCol')}` and the checkbox `<td>` with a select:

```tsx
<td className="td-cell text-center">
  <select
    value={u.role}
    disabled={u.id === myUserId}
    onChange={e => setRole(u, e.target.value)}
    className="field-sm text-xs"
  >
    <option value="technician">{t('roleTechnician')}</option>
    <option value="tester">{t('roleTester')}</option>
    <option value="admin">{t('roleAdmin')}</option>
  </select>
</td>
```

- Replace `toggleAdmin` with:

```tsx
  async function setRole(user: User, role: string) {
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
    await load();
  }
```

- [ ] **Step 7: Typecheck + full tests + commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

```bash
git add src/app/api/admin/users/route.ts src/app/admin/users/AdminUsersClient.tsx src/lib/i18n-dict.ts tests/admin-routes.test.ts
git commit -m "feat: role management (worker/tester/admin) on users page"
```

---

### Task 4: Tester requests API (tester side)

**Files:**
- Create: `src/app/api/tester-requests/route.ts`
- Modify: `src/lib/i18n-dict.ts` (`apiErrorMap` entries)
- Modify: `src/lib/push.ts` (add `sendPushToTechnician`)
- Test: `tests/tester-requests-routes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/tester-requests` (tester session) → `{ requests: Array<{ id, date, shift, stationId, station: { name } | null, swVersion, hwNotes, description, status, assignedStationId, createdAt }>, stations: Array<{ id, name }> }` (requests newest-first; stations = active, position-ordered — feeds the request form dropdown).
  - `POST /api/tester-requests` body `{ date, shift, stationId?, swVersion?, hwNotes?, description }` → `{ ok: true }`; pushes to admins.
  - `DELETE /api/tester-requests` body `{ id }` → `{ ok: true }`; own + pending only.
  - `sendPushToTechnician(technicianId: number, payload: PushPayload): Promise<void>` in `src/lib/push.ts`.
- Consumes: `Session.role === 'tester'` (Task 2), `prisma.testerRequest` (Task 1).

- [ ] **Step 1: Write failing tests**

Create `tests/tester-requests-routes.test.ts`:

```ts
import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
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
  await prisma.station.deleteMany();
  await prisma.schedule.deleteMany();
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tester-requests-routes.test.ts`
Expected: FAIL — module `@/app/api/tester-requests/route` not found.

- [ ] **Step 3: Add `sendPushToTechnician`**

Append to `src/lib/push.ts`:

```ts
// Sends `payload` only to subscriptions of one technician account (e.g. a tester
// being told their machine request was approved/rejected). Best-effort like the rest.
export async function sendPushToTechnician(technicianId: number, payload: PushPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { technicianId } }).catch(() => []);
  await deliverToSubscriptions(subscriptions, payload);
}
```

- [ ] **Step 4: Implement the route**

Create `src/app/api/tester-requests/route.ts`:

```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekStartOf } from '@/lib/dates';
import { sendPushToAdmins } from '@/lib/push';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const [requests, stations] = await Promise.all([
    prisma.testerRequest.findMany({
      where: { testerId: session.userId },
      include: { station: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.station.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { position: 'asc' } }),
  ]);
  return Response.json({ requests, stations });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = typeof body.date === 'string' ? body.date : '';
  const shift = typeof body.shift === 'string' ? body.shift : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const swVersion = typeof body.swVersion === 'string' ? body.swVersion.trim() : '';
  const hwNotes = typeof body.hwNotes === 'string' ? body.hwNotes.trim() : '';
  const stationId = body.stationId === undefined || body.stationId === null ? null : body.stationId;
  if (
    !DATE_RE.test(date) ||
    (shift !== 'morning' && shift !== 'evening') ||
    !description ||
    description.length > MAX_TEXT ||
    swVersion.length > MAX_TEXT ||
    hwNotes.length > MAX_TEXT ||
    (stationId !== null && !Number.isInteger(stationId))
  ) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  if (stationId !== null) {
    const station = await prisma.station.findUnique({ where: { id: stationId as number } });
    if (!station) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: weekStartOf(date) } });
  if (schedule?.status === 'published') {
    return Response.json({ error: 'התוכנית לשבוע זה כבר פורסמה — פנה למנהל' }, { status: 409 });
  }
  await prisma.testerRequest.create({
    data: {
      testerId: session.userId!,
      date,
      shift,
      stationId: stationId as number | null,
      swVersion: swVersion || null,
      hwNotes: hwNotes || null,
      description,
    },
  });
  try {
    await sendPushToAdmins({
      title: 'HP Indigo Scheduler',
      body: `בקשת מכונה חדשה מ־${session.name} / New machine request from ${session.name}`,
    });
  } catch {
    // best-effort
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const request = await prisma.testerRequest.findUnique({ where: { id: body.id } });
  if (!request || request.testerId !== session.userId) {
    return Response.json({ error: 'בקשה לא נמצאה' }, { status: 404 });
  }
  if (request.status !== 'pending') {
    return Response.json({ error: 'לא ניתן לבטל בקשה שכבר טופלה' }, { status: 400 });
  }
  await prisma.testerRequest.delete({ where: { id: body.id } });
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: apiErrorMap entries**

In `src/lib/i18n-dict.ts` `apiErrorMap` add:

```ts
  'התוכנית לשבוע זה כבר פורסמה — פנה למנהל': 'This week’s schedule has already been published — contact the admin',
  'בקשה לא נמצאה': 'Request not found',
  'לא ניתן לבטל בקשה שכבר טופלה': 'A request that was already handled cannot be canceled',
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/tester-requests-routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/tester-requests src/lib/push.ts src/lib/i18n-dict.ts tests/tester-requests-routes.test.ts
git commit -m "feat: tester machine-request API (create/list/cancel)"
```

---

### Task 5: Admin tester-requests API (list by week, approve/reject)

**Files:**
- Create: `src/app/api/admin/tester-requests/route.ts`
- Test: `tests/admin-tester-requests-routes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/tester-requests?weekStart=YYYY-MM-DD` (admin) → `{ requests: Array<{ id, date, shift, stationId, station: { name } | null, swVersion, hwNotes, description, status, assignedStationId, tester: { id, name } }> }` for the 7 days starting at weekStart (Sun–Sat superset — covers optional Friday), pending first then by date.
  - `PUT /api/admin/tester-requests` body `{ id, action: 'approve', stationId }` or `{ id, action: 'reject' }` → `{ ok: true }`; approve sets `status='approved', assignedStationId=stationId`; reject sets `status='rejected'`; both push to the tester.
- Consumes: `sendPushToTechnician` (Task 4), `weekDates` from `@/lib/dates`.

- [ ] **Step 1: Write failing tests**

Create `tests/admin-tester-requests-routes.test.ts`:

```ts
import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET, PUT } from '@/app/api/admin/tester-requests/route';

const WEEK = '2026-07-19';

async function adminReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ userId: 999, role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
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
  await prisma.station.deleteMany();
  const t = await prisma.technician.create({ data: { name: 'נסיין', email: 'n@x.com', passwordHash: 'x', role: 'tester' } });
  testerId = t.id;
  const s = await prisma.station.create({ data: { name: 'Press 1', position: 0 } });
  stationId = s.id;
});

test('GET returns only the requested week, pending first', async () => {
  await prisma.testerRequest.createMany({
    data: [
      { testerId, date: '2026-07-20', shift: 'morning', description: 'in week' },
      { testerId, date: '2026-07-26', shift: 'morning', description: 'next week' },
      { testerId, date: '2026-07-21', shift: 'evening', description: 'approved', status: 'approved' },
    ],
  });
  const res = await GET(await adminReq('GET', `/api/admin/tester-requests?weekStart=${WEEK}`));
  expect(res.status).toBe(200);
  const { requests } = await res.json();
  expect(requests).toHaveLength(2);
  expect(requests[0].status).toBe('pending');
  expect(requests[0].tester.name).toBe('נסיין');
});

test('PUT approve sets status and assignedStationId', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  const res = await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId }));
  expect(res.status).toBe(200);
  const row = await prisma.testerRequest.findUnique({ where: { id: r.id } });
  expect(row!.status).toBe('approved');
  expect(row!.assignedStationId).toBe(stationId);
});

test('PUT approve requires an existing station', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve' }))).status).toBe(400);
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'approve', stationId: stationId + 99 }))).status).toBe(400);
});

test('PUT reject sets status', async () => {
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'reject' }))).status).toBe(200);
  expect((await prisma.testerRequest.findUnique({ where: { id: r.id } }))!.status).toBe('rejected');
});

test('PUT 404s on unknown request and rejects bad action', async () => {
  expect((await PUT(await adminReq('PUT', '/x', { id: 12345, action: 'reject' }))).status).toBe(404);
  const r = await prisma.testerRequest.create({ data: { testerId, date: '2026-07-20', shift: 'morning', description: 'x' } });
  expect((await PUT(await adminReq('PUT', '/x', { id: r.id, action: 'zap' }))).status).toBe(400);
});

test('requires admin session', async () => {
  const token = await createSessionToken({ userId: testerId, role: 'tester', name: 'נ' });
  const res = await GET(new Request(`http://test/x?weekStart=${WEEK}`, { headers: { cookie: `session=${token}` } }));
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/admin-tester-requests-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/admin/tester-requests/route.ts`:

```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates } from '@/lib/dates';
import { sendPushToTechnician } from '@/lib/push';
import { formatDate } from '@/lib/dates';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart || !DATE_RE.test(weekStart)) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }
  // weekDates with includeFriday=true is the superset of any board configuration.
  const dates = weekDates(weekStart, true);
  const requests = await prisma.testerRequest.findMany({
    where: { date: { in: dates } },
    include: { tester: { select: { id: true, name: true } }, station: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
  });
  requests.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
  return Response.json({ requests });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number; action?: string; stationId?: number };
  const { id, action } = body;
  if (typeof id !== 'number' || (action !== 'approve' && action !== 'reject')) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const request = await prisma.testerRequest.findUnique({ where: { id } });
  if (!request) return Response.json({ error: 'בקשה לא נמצאה' }, { status: 404 });

  if (action === 'approve') {
    if (typeof body.stationId !== 'number') {
      return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    }
    const station = await prisma.station.findUnique({ where: { id: body.stationId } });
    if (!station) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    await prisma.testerRequest.update({
      where: { id },
      data: { status: 'approved', assignedStationId: body.stationId },
    });
    try {
      await sendPushToTechnician(request.testerId, {
        title: 'HP Indigo Scheduler',
        body: `בקשת המכונה שלך ל־${formatDate(request.date)} אושרה (${station.name}) / Your machine request for ${formatDate(request.date)} was approved (${station.name})`,
      });
    } catch {
      // best-effort
    }
  } else {
    await prisma.testerRequest.update({ where: { id }, data: { status: 'rejected', assignedStationId: null } });
    try {
      await sendPushToTechnician(request.testerId, {
        title: 'HP Indigo Scheduler',
        body: `בקשת המכונה שלך ל־${formatDate(request.date)} נדחתה / Your machine request for ${formatDate(request.date)} was declined`,
      });
    } catch {
      // best-effort
    }
  }
  return Response.json({ ok: true });
}
```

Note: `formatDate` — confirm it exists in `@/lib/dates` (it's used by AdminScheduleClient); if its signature is `formatDate(date: string)` returning `DD/MM`, use as-is. Merge the two imports from `@/lib/dates` into one line.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/admin-tester-requests-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/tester-requests tests/admin-tester-requests-routes.test.ts
git commit -m "feat: admin API to review tester machine requests"
```

---

### Task 6: Tester UI — requests page, nav, redirects

**Files:**
- Create: `src/app/requests/page.tsx`, `src/app/requests/RequestsClient.tsx`
- Modify: `src/app/page.tsx` (tester → `/requests`)
- Modify: `src/app/schedule/page.tsx` (allow tester), `src/app/schedule/ScheduleClient.tsx` (role-aware nav links)
- Modify: `src/lib/i18n-dict.ts` (keys below)

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/tester-requests` (Task 4).
- Produces: tester nav links `[{ href: '/schedule' }, { href: '/requests' }]`; `ScheduleClient` prop `role: 'technician' | 'tester'`.

- [ ] **Step 1: i18n keys**

Add to `he` and mirror in `en` in `src/lib/i18n-dict.ts`:

```ts
  myRequestsNav: 'בקשות מכונה',                    // en: 'Machine Requests'
  newRequestHeading: 'בקשת מכונה חדשה',            // en: 'New machine request'
  requestDateLabel: 'תאריך',                        // en: 'Date'
  requestShiftLabel: 'משמרת',                       // en: 'Shift'
  requestStationLabel: 'מכונה',                     // en: 'Press'
  anyPressOption: 'כל מכונה',                       // en: 'Any press'
  requestDescriptionLabel: 'מטרת הניסוי',           // en: 'Experiment purpose'
  requestSwLabel: 'גרסת תוכנה (אופציונלי)',         // en: 'SW version (optional)'
  requestHwLabel: 'דרישות חומרה (אופציונלי)',       // en: 'HW requirements (optional)'
  submitRequestBtn: 'שליחת בקשה',                   // en: 'Submit request'
  requestSubmittedMsg: 'הבקשה נשלחה למנהל',         // en: 'Request sent to the admin'
  myRequestsHeading: 'הבקשות שלי',                  // en: 'My requests'
  noRequestsYet: 'אין עדיין בקשות.',                // en: 'No requests yet.'
  statusPendingReq: 'ממתינה',                       // en: 'Pending'
  statusApprovedReq: 'אושרה',                       // en: 'Approved'
  statusRejectedReq: 'נדחתה',                       // en: 'Rejected'
  cancelRequestBtn: 'ביטול',                        // en: 'Cancel'
  approvedOnPressPrefix: 'אושרה על',               // en: 'Approved on'
```

(`shiftLabel(lang, shift)` from `@/lib/labels` renders shift names — reuse, no new keys.)

- [ ] **Step 2: Server page**

Create `src/app/requests/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import RequestsClient from './RequestsClient';

export default async function RequestsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect('/login');
  if (session.role !== 'tester') redirect(session.role === 'admin' ? '/admin' : '/constraints');
  return <RequestsClient name={session.name} />;
}
```

- [ ] **Step 3: Client page**

Create `src/app/requests/RequestsClient.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel } from '@/lib/labels';
import { useT, translateApiError } from '@/lib/i18n';

interface RequestRow {
  id: number;
  date: string;
  shift: string;
  stationId: number | null;
  station: { name: string } | null;
  swVersion: string | null;
  hwNotes: string | null;
  description: string;
  status: string;
  assignedStationId: number | null;
}
interface Station { id: number; name: string }

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-700',
};

export default function RequestsClient({ name }: { name: string }) {
  const { t, lang } = useT();
  const TESTER_LINKS = [
    { href: '/schedule', label: t('scheduleNav') },
    { href: '/requests', label: t('myRequestsNav') },
  ];
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [shift, setShift] = useState('morning');
  const [stationId, setStationId] = useState('');
  const [description, setDescription] = useState('');
  const [swVersion, setSwVersion] = useState('');
  const [hwNotes, setHwNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tester-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests);
        setStations(data.stations);
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('networkErrorRefresh'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/tester-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date,
          shift,
          stationId: stationId === '' ? null : Number(stationId),
          description,
          swVersion,
          hwNotes,
        }),
      });
      if (res.ok) {
        setMessage(t('requestSubmittedMsg'));
        setDescription('');
        setSwVersion('');
        setHwNotes('');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  async function cancel(id: number) {
    setError('');
    try {
      const res = await fetch('/api/tester-requests', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
    await load();
  }

  function statusLabel(status: string): string {
    if (status === 'approved') return t('statusApprovedReq');
    if (status === 'rejected') return t('statusRejectedReq');
    return t('statusPendingReq');
  }

  return (
    <div>
      <NavBar name={name} links={TESTER_LINKS} />
      <main className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}
        {message && (
          <p className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">{message}</p>
        )}
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('newRequestHeading')}</h2>
          <form onSubmit={submit} className="surface-card space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm text-slate-600">
                {t('requestDateLabel')}
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="field mt-1 w-full" />
              </label>
              <label className="text-sm text-slate-600">
                {t('requestShiftLabel')}
                <select value={shift} onChange={e => setShift(e.target.value)} className="field mt-1 w-full">
                  <option value="morning">{shiftLabel(lang, 'morning')}</option>
                  <option value="evening">{shiftLabel(lang, 'evening')}</option>
                </select>
              </label>
              <label className="text-sm text-slate-600">
                {t('requestStationLabel')}
                <select value={stationId} onChange={e => setStationId(e.target.value)} className="field mt-1 w-full">
                  <option value="">{t('anyPressOption')}</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-slate-600">
              {t('requestDescriptionLabel')}
              <textarea
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                className="field mt-1 w-full"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                {t('requestSwLabel')}
                <input value={swVersion} onChange={e => setSwVersion(e.target.value)} maxLength={500} className="field mt-1 w-full" />
              </label>
              <label className="text-sm text-slate-600">
                {t('requestHwLabel')}
                <input value={hwNotes} onChange={e => setHwNotes(e.target.value)} maxLength={500} className="field mt-1 w-full" />
              </label>
            </div>
            <button type="submit" className="btn-primary">{t('submitRequestBtn')}</button>
          </form>
        </section>
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('myRequestsHeading')}</h2>
          {loading ? (
            <Loading />
          ) : requests.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noRequestsYet')}</p>
          ) : (
            <ul className="surface-card divide-y divide-slate-100">
              {requests.map(r => (
                <li key={r.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">
                      {dayName(r.date, lang)} {formatDate(r.date)} · {shiftLabel(lang, r.shift)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {r.station?.name ?? t('anyPressOption')}
                    </span>
                    <span className={`badge ms-auto ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                      {statusLabel(r.status)}
                    </span>
                    {r.status === 'pending' && (
                      <button onClick={() => cancel(r.id)} className="link-danger text-sm">
                        {t('cancelRequestBtn')}
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{r.description}</p>
                  {(r.swVersion || r.hwNotes) && (
                    <p className="text-xs text-slate-500">
                      {r.swVersion && <span className="me-3">SW: {r.swVersion}</span>}
                      {r.hwNotes && <span>HW: {r.hwNotes}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Redirects + schedule access**

`src/app/page.tsx` line 9:

```tsx
  redirect(session.role === 'admin' ? '/admin' : session.role === 'tester' ? '/requests' : '/constraints');
```

`src/app/schedule/page.tsx`:

```tsx
  if (!session || (session.role !== 'technician' && session.role !== 'tester')) redirect('/login');
  return <ScheduleClient name={session.name} technicianId={session.userId!} role={session.role} />;
```

`src/app/schedule/ScheduleClient.tsx`:
- Props: `{ name, technicianId, role }: { name: string; technicianId: number; role: 'technician' | 'tester' }`.
- Links:

```tsx
  const TECH_LINKS =
    role === 'tester'
      ? [
          { href: '/schedule', label: t('scheduleNav') },
          { href: '/requests', label: t('myRequestsNav') },
        ]
      : [
          { href: '/constraints', label: t('myConstraintsNav') },
          { href: '/schedule', label: t('scheduleNav') },
          { href: '/vacations', label: t('myVacationsNav') },
        ];
```

- Hide the "your shifts highlighted" hint for testers: wrap that `<p>` with `{role !== 'tester' && (...)}` and pass `highlightTechId={role === 'tester' ? undefined : technicianId}`.

- [ ] **Step 5: Verify guards on other pages**

Check `src/app/constraints/page.tsx` and `src/app/vacations/page.tsx` redirect any non-`technician` role away (they already check `session.role !== 'technician'`; tester lands on `/login` → `/` → `/requests`, acceptable). If a page checks only `!session`, tighten it to require `technician`.

- [ ] **Step 6: Typecheck + tests + commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

```bash
git add src/app/requests src/app/page.tsx src/app/schedule src/lib/i18n-dict.ts
git commit -m "feat: tester machine-requests page and read-only schedule access"
```

---

### Task 7: Admin board — requests panel with approve/reject + alone warning

**Files:**
- Modify: `src/app/admin/schedule/AdminScheduleClient.tsx`
- Modify: `src/lib/i18n-dict.ts` (keys below)

**Interfaces:**
- Consumes: `GET/PUT /api/admin/tester-requests` (Task 5); existing `cells` state, `saveDraft`, `key()` helper.
- Produces: `saveDraft(overrideFriday?: boolean, cellsOverride?: Record<CellKey, CellValue>): Promise<boolean>` (extended signature — payload built from `cellsOverride` when given).

- [ ] **Step 1: i18n keys**

Add to `he`, mirror in `en`:

```ts
  testerRequestsHeading: 'בקשות נסיינים',           // en: 'Tester requests'
  approveBtn: 'אישור',                              // en: 'Approve'
  rejectBtn: 'דחייה',                               // en: 'Reject'
  testerAloneConfirm: 'אין עובד משובץ במשמרת זו על המכונה — לשבץ את הנסיין לבד?',
  // en: 'No worker is assigned to this press shift — place the tester alone?'
  requestApprovedMsg: 'הבקשה אושרה ושובצה',         // en: 'Request approved and placed'
  requestRejectedMsg: 'הבקשה נדחתה',                // en: 'Request rejected'
  swShortLabel: 'תוכנה',                            // en: 'SW'
  hwShortLabel: 'חומרה',                            // en: 'HW'
```

(reuse `anyPressOption`, `statusPendingReq`/`statusApprovedReq`/`statusRejectedReq` from Task 6.)

- [ ] **Step 2: Extract payload builder + extend saveDraft**

In `AdminScheduleClient.tsx`, replace the `assignmentsPayload` memo body with a call to a plain function so approval can build a payload from not-yet-committed state:

```tsx
  function buildPayload(cellsMap: Record<CellKey, CellValue>, friday: boolean) {
    const validDates = new Set(weekDates(weekStart, friday));
    return Object.entries(cellsMap)
      .filter(
        ([, v]) => v.technicianId !== '' || v.experimenter.trim() !== '' || v.note.trim() !== '' || v.color !== null
      )
      .map(([k, v]) => {
        const [date, shift, stationId] = k.split('|');
        return {
          date,
          shift,
          stationId: Number(stationId),
          technicianId: v.technicianId === '' ? null : v.technicianId,
          experimenter: v.experimenter.trim() || undefined,
          note: v.note.trim() || undefined,
          color: v.color,
        };
      })
      .filter(a => validDates.has(a.date));
  }

  const assignmentsPayload = useMemo(() => buildPayload(cells, includeFriday), [cells, weekStart, includeFriday]);
```

Extend `saveDraft`:

```tsx
  async function saveDraft(overrideFriday?: boolean, cellsOverride?: Record<CellKey, CellValue>): Promise<boolean> {
    ...
        body: JSON.stringify({
          weekStart,
          includeFriday: overrideFriday ?? includeFriday,
          assignments: cellsOverride ? buildPayload(cellsOverride, overrideFriday ?? includeFriday) : assignmentsPayload,
        }),
    ...
  }
```

- [ ] **Step 3: Load requests with the week**

Add state + types near the other state hooks:

```tsx
  interface TesterRequestRow {
    id: number;
    date: string;
    shift: string;
    stationId: number | null;
    station: { name: string } | null;
    swVersion: string | null;
    hwNotes: string | null;
    description: string;
    status: string;
    tester: { id: number; name: string };
  }
  const [testerRequests, setTesterRequests] = useState<TesterRequestRow[]>([]);
  const [requestStationPick, setRequestStationPick] = useState<Record<number, number | ''>>({});
```

(Define the interface at module scope next to `Tech`/`Station`, not inside the component.)

In `load()`, add a third fetch to the `Promise.all`:

```tsx
      const [schedRes, overviewRes, requestsRes] = await Promise.all([
        fetch(`/api/schedule?weekStart=${ws}`),
        fetch(`/api/admin/overview?weekStart=${ws}`),
        fetch(`/api/admin/tester-requests?weekStart=${ws}`),
      ]);
```

and after the existing ok-handling (requests are non-critical — board must render even if this fails):

```tsx
      if (requestsRes.ok) {
        const { requests } = await requestsRes.json();
        setTesterRequests(requests);
        setRequestStationPick(
          Object.fromEntries(
            requests.map((r: TesterRequestRow) => [r.id, r.stationId ?? ''])
          )
        );
      }
```

- [ ] **Step 4: Approve / reject handlers**

```tsx
  async function approveRequest(r: TesterRequestRow) {
    const pick = requestStationPick[r.id];
    if (pick === '' || pick === undefined) return;
    const k = key(r.date, r.shift, pick);
    const cell = cells[k] ?? emptyCell;
    if (cell.technicianId === '' && !confirm(t('testerAloneConfirm'))) return;
    const experimenter = cell.experimenter.trim() ? `${cell.experimenter.trim()}, ${r.tester.name}` : r.tester.name;
    const nextCells = { ...cells, [k]: { ...cell, experimenter } };
    setCells(nextCells);
    if (!(await saveDraft(undefined, nextCells))) return;
    try {
      const res = await fetch('/api/admin/tester-requests', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: r.id, action: 'approve', stationId: pick }),
      });
      if (res.ok) {
        setMessage(t('requestApprovedMsg'));
        setTesterRequests(reqs => reqs.map(x => (x.id === r.id ? { ...x, status: 'approved' } : x)));
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setMessage(t('networkError'));
    }
  }

  async function rejectRequest(r: TesterRequestRow) {
    try {
      const res = await fetch('/api/admin/tester-requests', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: r.id, action: 'reject' }),
      });
      if (res.ok) {
        setMessage(t('requestRejectedMsg'));
        setTesterRequests(reqs => reqs.map(x => (x.id === r.id ? { ...x, status: 'rejected' } : x)));
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setMessage(t('networkError'));
    }
  }
```

- [ ] **Step 5: Render the panel**

In the edit view (inside the `!cleanView` branch, right after the action-button row and message `<p>`, before the board table), render when the week has requests:

```tsx
            {testerRequests.length > 0 && (
              <div className="surface-card mb-4 p-4">
                <h3 className="mb-2 font-bold text-slate-900">{t('testerRequestsHeading')}</h3>
                <ul className="divide-y divide-slate-100">
                  {testerRequests.map(r => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="font-medium text-slate-800">{r.tester.name}</span>
                      <span className="text-slate-600">
                        {dayName(r.date, lang)} {formatDate(r.date)} · {shiftLabel(lang, r.shift)}
                      </span>
                      <span className="text-slate-500">{r.station?.name ?? t('anyPressOption')}</span>
                      <span className="basis-full text-slate-600">{r.description}</span>
                      {(r.swVersion || r.hwNotes) && (
                        <span className="basis-full text-xs text-slate-500">
                          {r.swVersion && <span className="me-3">{t('swShortLabel')}: {r.swVersion}</span>}
                          {r.hwNotes && <span>{t('hwShortLabel')}: {r.hwNotes}</span>}
                        </span>
                      )}
                      {r.status === 'pending' ? (
                        <span className="ms-auto flex items-center gap-2">
                          <select
                            value={requestStationPick[r.id] ?? ''}
                            onChange={e =>
                              setRequestStationPick(p => ({
                                ...p,
                                [r.id]: e.target.value === '' ? '' : Number(e.target.value),
                              }))
                            }
                            className="field-sm text-xs"
                          >
                            <option value="">{t('stationLabel')}…</option>
                            {boardStations.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => approveRequest(r)}
                            disabled={requestStationPick[r.id] === '' || requestStationPick[r.id] === undefined}
                            className="btn-success btn-sm"
                          >
                            {t('approveBtn')}
                          </button>
                          <button onClick={() => rejectRequest(r)} className="btn-secondary btn-sm">
                            {t('rejectBtn')}
                          </button>
                        </span>
                      ) : (
                        <span
                          className={`badge ms-auto ${
                            r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {r.status === 'approved' ? t('statusApprovedReq') : t('statusRejectedReq')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
```

Check `btn-success btn-sm` / `btn-secondary btn-sm` exist in `globals.css` (they're used elsewhere — `btn-success` on publish, `btn-sm` on station buttons); if a combo is missing, use the closest existing class.

- [ ] **Step 6: Typecheck + full tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/schedule/AdminScheduleClient.tsx src/lib/i18n-dict.ts
git commit -m "feat: tester-request review panel on admin board with alone-press warning"
```

---

### Task 8: Verification pass

**Files:**
- Modify (if needed): whatever the checks below surface.

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green. (`npm run build` runs `prisma generate` first; sqlite provider is fine for a local build.)

- [ ] **Step 2: Manual smoke (dev server)**

Run `npm run dev`, then:
1. Admin → users page → set a user's role to נסיין.
2. Log in as that user → lands on `/requests` → submit a request (with and without specific press) → sees it pending; cancel works.
3. Admin → schedule page → panel shows the request → approve onto an empty press/shift → alone-warning confirm appears → confirm → cell shows tester name in experimenter slot → request badge flips to approved.
4. Tester schedule view after publish shows the placement.

- [ ] **Step 3: Deploy notes commit (if any fixes were made)**

Remind user (do not run): run `neon-migrate-tester-role.sql` against Neon, flip provider to `postgresql`, deploy — per README deploy flow.
