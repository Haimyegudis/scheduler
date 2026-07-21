# Shift Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hebrew RTL web app for technician shift scheduling: technicians enter weekly constraints, admin auto-generates a 4-station × 2-shift schedule, edits manually, publishes.

**Architecture:** Single Next.js (App Router) app — React pages + API route handlers. Prisma ORM over SQLite in dev (switched to Neon Postgres at deploy). JWT session in httpOnly cookie. Pure-function scheduling algorithm, fully unit-tested.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Prisma, SQLite→Postgres (Neon), jose (JWT), bcryptjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-shift-scheduler-design.md`

## Global Constraints

- UI language: Hebrew, `dir="rtl"`, `lang="he"`, responsive for mobile.
- Password minimum: **8 characters**. No email verification.
- Admin credentials (server-side check, hardcoded per spec): username `admin`, password `admin123`.
- Stations: **1–4** (identical). Shifts: `morning` | `evening`.
- Constraint values: `morning` | `evening` | `flex` | `off`. Missing constraint = unavailable.
- Work days: Sunday–Thursday; Friday only when `includeFriday=true` on that week's Schedule. Never Saturday.
- Schedule status: `draft` | `published`. Technicians see only `published`; constraint editing locked once published.
- Dates are strings `YYYY-MM-DD`; `weekStart` = the Sunday of the week. All date math in UTC.
- Hard rules the generator never violates: 1 technician per station-shift; no technician twice in one day; only per constraints. Shortage → station left empty (no Assignment row). Manual admin edits MAY violate rules (UI warning only).
- Env vars: `DATABASE_URL`, `JWT_SECRET` (in `.env`, gitignored). Tests use `file:./test.db` + `JWT_SECRET=test-secret` via vitest config.
- API error responses: `{ "error": "<Hebrew message>" }` with proper status (400/401/403/404/409).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env`, `vitest.config.ts`, `prisma/schema.prisma`, `src/lib/db.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `tests/global-setup.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `prisma` singleton from `@/lib/db`; Prisma models `Technician`, `Constraint`, `Schedule`, `Assignment`; npm scripts `dev`, `build`, `test`; `@/*` alias → `src/*`.

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "shift-scheduler",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "test": "vitest run",
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^6.7.0",
    "bcryptjs": "^3.0.2",
    "jose": "^6.0.10",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "prisma": "^6.7.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`.gitignore`:
```
node_modules/
.next/
.env
prisma/*.db
*.tsbuildinfo
next-env.d.ts
```

`.env`:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev-secret-change-in-production"
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    env: { DATABASE_URL: 'file:./test.db', JWT_SECRET: 'test-secret' },
    fileParallelism: false,
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

- [ ] **Step 2: Write Prisma schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Technician {
  id           Int          @id @default(autoincrement())
  name         String
  email        String       @unique
  passwordHash String
  createdAt    DateTime     @default(now())
  constraints  Constraint[]
  assignments  Assignment[]
}

model Constraint {
  id           Int        @id @default(autoincrement())
  technicianId Int
  technician   Technician @relation(fields: [technicianId], references: [id], onDelete: Cascade)
  date         String
  value        String

  @@unique([technicianId, date])
}

model Schedule {
  id            Int          @id @default(autoincrement())
  weekStart     String       @unique
  status        String       @default("draft")
  includeFriday Boolean      @default(false)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  assignments   Assignment[]
}

model Assignment {
  id           Int        @id @default(autoincrement())
  scheduleId   Int
  schedule     Schedule   @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  date         String
  shift        String
  station      Int
  technicianId Int
  technician   Technician @relation(fields: [technicianId], references: [id], onDelete: Cascade)

  @@unique([scheduleId, date, shift, station])
}
```

- [ ] **Step 3: Write db singleton, minimal app shell, test setup**

`src/lib/db.ts`:
```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

`src/app/globals.css`:
```css
@import "tailwindcss";

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'שיבוץ משמרות' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (placeholder, replaced in Task 8):
```tsx
export default function Home() {
  return <main className="p-8">שיבוץ משמרות</main>;
}
```

`tests/global-setup.ts`:
```ts
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export default function setup() {
  rmSync('prisma/test.db', { force: true });
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
```

`tests/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';
import { prisma } from '@/lib/db';

test('db connects and is empty', async () => {
  expect(await prisma.technician.count()).toBe(0);
});
```

- [ ] **Step 4: Install and generate**

Run: `npm install` then `npx prisma generate` then `npx prisma db push`
Expected: no errors; `prisma/dev.db` created.

- [ ] **Step 5: Verify tests and dev server**

Run: `npm test`
Expected: 1 passed.
Run: `npm run dev` briefly, open http://localhost:3000
Expected: page shows "שיבוץ משמרות" right-aligned (RTL).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Prisma + Vitest project"
```

---

### Task 2: Date utilities

**Files:**
- Create: `src/lib/dates.ts`
- Test: `tests/dates.test.ts`

**Interfaces:**
- Produces:
  - `weekStartOf(date: string): string` — Sunday of that date's week.
  - `addDays(date: string, n: number): string`
  - `weekDates(weekStart: string, includeFriday: boolean): string[]` — 5 or 6 dates.
  - `getCurrentWeekStart(now?: Date): string`
  - `dayName(date: string): string` — Hebrew day name.
  - `formatDate(date: string): string` — `D.M` display form.

- [ ] **Step 1: Write the failing tests**

`tests/dates.test.ts`:
```ts
import { test, expect } from 'vitest';
import { weekStartOf, addDays, weekDates, dayName, formatDate, getCurrentWeekStart } from '@/lib/dates';

test('weekStartOf returns the Sunday of the week', () => {
  expect(weekStartOf('2026-07-21')).toBe('2026-07-19'); // Tuesday -> Sunday
  expect(weekStartOf('2026-07-19')).toBe('2026-07-19'); // Sunday -> itself
  expect(weekStartOf('2026-07-25')).toBe('2026-07-19'); // Saturday -> same week Sunday
});

test('addDays crosses month boundaries', () => {
  expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  expect(addDays('2026-07-19', 7)).toBe('2026-07-26');
  expect(addDays('2026-07-19', -7)).toBe('2026-07-12');
});

test('weekDates returns Sun-Thu, plus Friday when enabled', () => {
  expect(weekDates('2026-07-19', false)).toEqual([
    '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
  ]);
  expect(weekDates('2026-07-19', true)).toHaveLength(6);
  expect(weekDates('2026-07-19', true)[5]).toBe('2026-07-24');
});

test('dayName and formatDate', () => {
  expect(dayName('2026-07-19')).toBe('ראשון');
  expect(dayName('2026-07-24')).toBe('שישי');
  expect(formatDate('2026-07-19')).toBe('19.7');
});

test('getCurrentWeekStart uses provided date', () => {
  expect(getCurrentWeekStart(new Date(Date.UTC(2026, 6, 21)))).toBe('2026-07-19');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dates.test.ts`
Expected: FAIL — cannot resolve `@/lib/dates`.

- [ ] **Step 3: Implement**

`src/lib/dates.ts`:
```ts
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekStartOf(date: string): string {
  return addDays(date, -toDate(date).getUTCDay());
}

export function weekDates(weekStart: string, includeFriday: boolean): string[] {
  const count = includeFriday ? 6 : 5;
  return Array.from({ length: count }, (_, i) => addDays(weekStart, i));
}

export function getCurrentWeekStart(now: Date = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return weekStartOf(iso);
}

export function dayName(date: string): string {
  return HEBREW_DAYS[toDate(date).getUTCDay()];
}

export function formatDate(date: string): string {
  const d = toDate(date);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}
```

Note: `getCurrentWeekStart` builds the ISO string from *local* year/month/day (the user's wall-clock day), then all further math is UTC on date strings.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dates.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts tests/dates.test.ts
git commit -m "feat: week/date utilities (Sunday-based weeks, Hebrew day names)"
```

---

### Task 3: Scheduling algorithm

**Files:**
- Create: `src/lib/scheduler.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces:
  ```ts
  export type ConstraintValue = 'morning' | 'evening' | 'flex' | 'off';
  export type Shift = 'morning' | 'evening';
  export interface TechAvailability {
    technicianId: number;
    constraints: Record<string, ConstraintValue>; // date -> value
  }
  export interface GeneratedAssignment {
    date: string; shift: Shift; station: number; technicianId: number;
  }
  export function generateAssignments(dates: string[], techs: TechAvailability[]): GeneratedAssignment[];
  ```

- [ ] **Step 1: Write the failing tests**

`tests/scheduler.test.ts`:
```ts
import { test, expect } from 'vitest';
import { generateAssignments, type TechAvailability } from '@/lib/scheduler';

const D1 = '2026-07-19';
const D2 = '2026-07-20';

function tech(id: number, constraints: Record<string, string>): TechAvailability {
  return { technicianId: id, constraints: constraints as TechAvailability['constraints'] };
}

test('fills 4 stations per shift when enough technicians', () => {
  const techs = [
    ...Array.from({ length: 4 }, (_, i) => tech(i + 1, { [D1]: 'morning' })),
    ...Array.from({ length: 4 }, (_, i) => tech(i + 5, { [D1]: 'evening' })),
  ];
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(8);
  expect(result.filter(a => a.shift === 'morning').map(a => a.station).sort()).toEqual([1, 2, 3, 4]);
  expect(result.filter(a => a.shift === 'evening').map(a => a.station).sort()).toEqual([1, 2, 3, 4]);
});

test('never assigns a technician twice in one day (flex goes to one shift only)', () => {
  const techs = Array.from({ length: 8 }, (_, i) => tech(i + 1, { [D1]: 'flex' }));
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(8);
  const ids = result.map(a => a.technicianId);
  expect(new Set(ids).size).toBe(8);
});

test('respects constraints: off and missing are never assigned', () => {
  const techs = [
    tech(1, { [D1]: 'off' }),
    tech(2, {}), // no constraint entered
    tech(3, { [D1]: 'morning' }),
  ];
  const result = generateAssignments([D1], techs);
  expect(result.every(a => a.technicianId === 3)).toBe(true);
});

test('morning-only technicians never get evening and vice versa', () => {
  const techs = [tech(1, { [D1]: 'morning' }), tech(2, { [D1]: 'evening' })];
  const result = generateAssignments([D1], techs);
  expect(result.find(a => a.technicianId === 1)!.shift).toBe('morning');
  expect(result.find(a => a.technicianId === 2)!.shift).toBe('evening');
});

test('shortage leaves stations empty rather than breaking rules', () => {
  const techs = [tech(1, { [D1]: 'morning' }), tech(2, { [D1]: 'morning' })];
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(2);
  expect(result.every(a => a.shift === 'morning')).toBe(true);
});

test('prefers morning-constrained over flex for morning shift', () => {
  const techs = [
    ...Array.from({ length: 4 }, (_, i) => tech(i + 1, { [D1]: 'flex' })),
    ...Array.from({ length: 4 }, (_, i) => tech(i + 5, { [D1]: 'morning' })),
  ];
  const result = generateAssignments([D1], techs);
  const morningIds = result.filter(a => a.shift === 'morning').map(a => a.technicianId).sort();
  expect(morningIds).toEqual([5, 6, 7, 8]); // morning-constrained win the tie
});

test('balances total shifts across the week', () => {
  // 8 techs all flex on two days -> 16 slots, everyone should get exactly 2
  const techs = Array.from({ length: 8 }, (_, i) =>
    tech(i + 1, { [D1]: 'flex', [D2]: 'flex' })
  );
  const result = generateAssignments([D1, D2], techs);
  expect(result).toHaveLength(16);
  const counts = new Map<number, number>();
  for (const a of result) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
  expect([...counts.values()]).toEqual(Array(8).fill(2));
});

test('deterministic: same input, same output', () => {
  const techs = Array.from({ length: 10 }, (_, i) => tech(i + 1, { [D1]: 'flex', [D2]: 'flex' }));
  expect(generateAssignments([D1, D2], techs)).toEqual(generateAssignments([D1, D2], techs));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scheduler.test.ts`
Expected: FAIL — cannot resolve `@/lib/scheduler`.

- [ ] **Step 3: Implement**

`src/lib/scheduler.ts`:
```ts
export type ConstraintValue = 'morning' | 'evening' | 'flex' | 'off';
export type Shift = 'morning' | 'evening';

export interface TechAvailability {
  technicianId: number;
  constraints: Record<string, ConstraintValue>;
}

export interface GeneratedAssignment {
  date: string;
  shift: Shift;
  station: number;
  technicianId: number;
}

const STATIONS = 4;

export function generateAssignments(
  dates: string[],
  techs: TechAvailability[]
): GeneratedAssignment[] {
  const totalShifts = new Map<number, number>();
  const shiftTypeCounts: Record<Shift, Map<number, number>> = {
    morning: new Map(),
    evening: new Map(),
  };
  for (const t of techs) {
    totalShifts.set(t.technicianId, 0);
    shiftTypeCounts.morning.set(t.technicianId, 0);
    shiftTypeCounts.evening.set(t.technicianId, 0);
  }

  const result: GeneratedAssignment[] = [];

  for (const date of dates) {
    const usedToday = new Set<number>();

    for (const shift of ['morning', 'evening'] as Shift[]) {
      const available = techs.filter(t => {
        const c = t.constraints[date];
        return (c === shift || c === 'flex') && !usedToday.has(t.technicianId);
      });

      available.sort((a, b) => {
        const byTotal = totalShifts.get(a.technicianId)! - totalShifts.get(b.technicianId)!;
        if (byTotal !== 0) return byTotal;
        if (shift === 'morning') {
          // keep flex technicians in reserve for the evening shift
          const aFlex = a.constraints[date] === 'flex' ? 1 : 0;
          const bFlex = b.constraints[date] === 'flex' ? 1 : 0;
          if (aFlex !== bFlex) return aFlex - bFlex;
        }
        const byType =
          shiftTypeCounts[shift].get(a.technicianId)! - shiftTypeCounts[shift].get(b.technicianId)!;
        if (byType !== 0) return byType;
        return a.technicianId - b.technicianId;
      });

      for (let station = 1; station <= Math.min(STATIONS, available.length); station++) {
        const t = available[station - 1];
        result.push({ date, shift, station, technicianId: t.technicianId });
        usedToday.add(t.technicianId);
        totalShifts.set(t.technicianId, totalShifts.get(t.technicianId)! + 1);
        shiftTypeCounts[shift].set(t.technicianId, shiftTypeCounts[shift].get(t.technicianId)! + 1);
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scheduler.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler.ts tests/scheduler.test.ts
git commit -m "feat: shift assignment algorithm with balancing and flex reserve"
```

---

### Task 4: Auth library

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Session { userId?: number; role: 'technician' | 'admin'; name: string }
  export function createSessionToken(session: Session): Promise<string>;
  export function verifySessionToken(token: string): Promise<Session | null>;
  export function sessionCookie(token: string): string;   // Set-Cookie value
  export function clearSessionCookie(): string;           // Set-Cookie value that expires
  export function getSession(req: Request): Promise<Session | null>; // reads Cookie header
  ```

- [ ] **Step 1: Write the failing tests**

`tests/auth.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Implement**

`src/lib/auth.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';

export interface Session {
  userId?: number;
  role: 'technician' | 'admin';
  name: string;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '');
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      ...(payload.userId !== undefined && { userId: payload.userId as number }),
      role: payload.role as Session['role'],
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `session=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

export async function getSession(req: Request): Promise<Session | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? verifySessionToken(match[1]) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/auth.test.ts
git commit -m "feat: JWT session helpers (cookie-based, jose)"
```

---

### Task 5: Auth API routes

**Files:**
- Create: `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/admin-login/route.ts`, `src/app/api/auth/logout/route.ts`
- Test: `tests/auth-routes.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`), `createSessionToken`/`sessionCookie`/`clearSessionCookie` (`@/lib/auth`).
- Produces HTTP API:
  - `POST /api/auth/register` `{name,email,password}` → 200 `{ok:true}` + Set-Cookie | 400 | 409
  - `POST /api/auth/login` `{email,password}` → 200 + Set-Cookie | 401
  - `POST /api/auth/admin-login` `{username,password}` → 200 + Set-Cookie | 401
  - `POST /api/auth/logout` → 200 + expiring Set-Cookie

- [ ] **Step 1: Write the failing tests**

`tests/auth-routes.test.ts`:
```ts
import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as adminLogin } from '@/app/api/auth/admin-login/route';
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
});

test('register creates technician and sets session cookie', async () => {
  const res = await register(jsonReq('/api/auth/register', { name: 'דני', email: 'a@b.com', password: 'password1' }));
  expect(res.status).toBe(200);
  const session = await verifySessionToken(cookieToken(res));
  expect(session?.role).toBe('technician');
  expect(session?.name).toBe('דני');
  const tech = await prisma.technician.findUnique({ where: { email: 'a@b.com' } });
  expect(tech).not.toBeNull();
  expect(tech!.passwordHash).not.toBe('password1');
});

test('register rejects short password and missing fields', async () => {
  expect((await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'short' }))).status).toBe(400);
  expect((await register(jsonReq('/x', { email: 'a@b.com', password: 'password1' }))).status).toBe(400);
  expect((await register(new Request('http://test/x', { method: 'POST' }))).status).toBe(400);
});

test('register rejects duplicate email with 409', async () => {
  await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'password1' }));
  const res = await register(jsonReq('/x', { name: 'b', email: 'a@b.com', password: 'password2' }));
  expect(res.status).toBe(409);
});

test('login succeeds with correct password, fails otherwise', async () => {
  await register(jsonReq('/x', { name: 'a', email: 'a@b.com', password: 'password1' }));
  const ok = await login(jsonReq('/x', { email: 'a@b.com', password: 'password1' }));
  expect(ok.status).toBe(200);
  expect((await login(jsonReq('/x', { email: 'a@b.com', password: 'wrongpass1' }))).status).toBe(401);
  expect((await login(jsonReq('/x', { email: 'no@b.com', password: 'password1' }))).status).toBe(401);
});

test('admin login with fixed credentials only', async () => {
  const ok = await adminLogin(jsonReq('/x', { username: 'admin', password: 'admin123' }));
  expect(ok.status).toBe(200);
  expect((await verifySessionToken(cookieToken(ok)))?.role).toBe('admin');
  expect((await adminLogin(jsonReq('/x', { username: 'admin', password: 'nope' }))).status).toBe(401);
});

test('logout clears the cookie', async () => {
  const res = await logout();
  expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four routes**

`src/app/api/auth/register/route.ts`:
```ts
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, sessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, email, password } = body as { name?: string; email?: string; password?: string };
  if (!name || !email || !password || password.length < 8) {
    return Response.json({ error: 'נא למלא שם, מייל וסיסמה באורך 8 תווים לפחות' }, { status: 400 });
  }
  const existing = await prisma.technician.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: 'המייל כבר רשום במערכת' }, { status: 409 });
  }
  const tech = await prisma.technician.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  const token = await createSessionToken({ userId: tech.id, role: 'technician', name: tech.name });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}
```

`src/app/api/auth/login/route.ts`:
```ts
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, sessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };
  const tech = email ? await prisma.technician.findUnique({ where: { email } }) : null;
  if (!tech || !password || !(await bcrypt.compare(password, tech.passwordHash))) {
    return Response.json({ error: 'מייל או סיסמה שגויים' }, { status: 401 });
  }
  const token = await createSessionToken({ userId: tech.id, role: 'technician', name: tech.name });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}
```

`src/app/api/auth/admin-login/route.ts`:
```ts
import { createSessionToken, sessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };
  if (username !== 'admin' || password !== 'admin123') {
    return Response.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 });
  }
  const token = await createSessionToken({ role: 'admin', name: 'מנהל' });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}
```

`src/app/api/auth/logout/route.ts`:
```ts
import { clearSessionCookie } from '@/lib/auth';

export async function POST() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth tests/auth-routes.test.ts
git commit -m "feat: auth API - register, login, admin login, logout"
```

---

### Task 6: Constraints API

**Files:**
- Create: `src/app/api/constraints/route.ts`
- Test: `tests/constraints-routes.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getSession`, `weekDates`/`weekStartOf` from `@/lib/dates`.
- Produces HTTP API:
  - `GET /api/constraints?weekStart=YYYY-MM-DD` (technician) → `{ constraints: Record<date, value>, includeFriday: boolean, published: boolean }`
  - `PUT /api/constraints` `{date, value}` → 200 `{ok:true}` | 400 invalid | 401 | 409 week published

- [ ] **Step 1: Write the failing tests**

`tests/constraints-routes.test.ts`:
```ts
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
  expect(data).toEqual({ constraints: {}, includeFriday: false, published: false });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/constraints-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/app/api/constraints/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf } from '@/lib/dates';

const VALID_VALUES = ['morning', 'evening', 'flex', 'off'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart || !DATE_RE.test(weekStart)) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  const dates = weekDates(weekStart, schedule?.includeFriday ?? false);
  const rows = await prisma.constraint.findMany({
    where: { technicianId: session.userId, date: { in: dates } },
  });
  return Response.json({
    constraints: Object.fromEntries(rows.map(r => [r.date, r.value])),
    includeFriday: schedule?.includeFriday ?? false,
    published: schedule?.status === 'published',
  });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { date, value } = body as { date?: string; value?: string };
  if (!date || !DATE_RE.test(date) || !value || !VALID_VALUES.includes(value)) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: weekStartOf(date) } });
  if (schedule?.status === 'published') {
    return Response.json({ error: 'התוכנית לשבוע זה כבר פורסמה — לא ניתן לשנות אילוצים' }, { status: 409 });
  }
  await prisma.constraint.upsert({
    where: { technicianId_date: { technicianId: session.userId!, date } },
    update: { value },
    create: { technicianId: session.userId!, date, value },
  });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/constraints-routes.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/constraints tests/constraints-routes.test.ts
git commit -m "feat: constraints API with published-week lock"
```

---

### Task 7: Schedule + admin API

**Files:**
- Create: `src/app/api/schedule/route.ts`, `src/app/api/admin/overview/route.ts`, `src/app/api/admin/schedule/route.ts`, `src/app/api/admin/schedule/generate/route.ts`, `src/app/api/admin/schedule/publish/route.ts`
- Test: `tests/admin-routes.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getSession`, `weekDates`, `generateAssignments` (`@/lib/scheduler`).
- Produces HTTP API:
  - `GET /api/schedule?weekStart=` (any logged-in) → `{ schedule: { status, includeFriday, assignments: Array<{date, shift, station, technicianId}> } | null, technicians: Array<{id, name}> }`. Technician gets `schedule: null` unless published.
  - `GET /api/admin/overview?weekStart=` (admin) → `{ technicians: Array<{id, name, status: 'full'|'partial'|'none'}>, constraints: Record<techId, Record<date, value>>, dates: string[], includeFriday: boolean, scheduleStatus: 'draft'|'published'|null }`
  - `PUT /api/admin/schedule` `{weekStart, includeFriday, assignments: Array<{date, shift, station, technicianId}>}` → upsert schedule + replace assignments (save draft / toggle Friday). Keeps existing status; creates as `draft`.
  - `POST /api/admin/schedule/generate` `{weekStart, includeFriday}` → runs algorithm, replaces assignments, status → `draft`.
  - `POST /api/admin/schedule/publish` `{weekStart}` → status → `published` | 404.

- [ ] **Step 1: Write the failing tests**

`tests/admin-routes.test.ts`:
```ts
import { test, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET as getSchedule } from '@/app/api/schedule/route';
import { GET as getOverview } from '@/app/api/admin/overview/route';
import { PUT as saveSchedule } from '@/app/api/admin/schedule/route';
import { POST as generate } from '@/app/api/admin/schedule/generate/route';
import { POST as publish } from '@/app/api/admin/schedule/publish/route';

const WEEK = '2026-07-19';
const DATES = ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'];

async function adminReq(method: string, url: string, body?: unknown): Promise<Request> {
  const token = await createSessionToken({ role: 'admin', name: 'מנהל' });
  return new Request(`http://test${url}`, {
    method,
    headers: { cookie: `session=${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function techReq(url: string, techId: number): Promise<Request> {
  const token = await createSessionToken({ userId: techId, role: 'technician', name: 'טק' });
  return new Request(`http://test${url}`, { headers: { cookie: `session=${token}` } });
}

let techIds: number[];

beforeEach(async () => {
  await prisma.technician.deleteMany();
  await prisma.schedule.deleteMany();
  techIds = [];
  for (let i = 1; i <= 10; i++) {
    const t = await prisma.technician.create({
      data: { name: `טכנאי ${i}`, email: `t${i}@x.com`, passwordHash: 'x' },
    });
    techIds.push(t.id);
    // 8 techs fill all 5 days as flex; techs 9-10 fill nothing
    if (i <= 8) {
      for (const date of DATES) {
        await prisma.constraint.create({ data: { technicianId: t.id, date, value: 'flex' } });
      }
    }
  }
});

test('admin routes reject non-admin sessions', async () => {
  expect((await getOverview(await techReq(`/x?weekStart=${WEEK}`, techIds[0]))).status).toBe(403);
  expect((await generate(await techReq('/x', techIds[0]))).status).toBe(403);
});

test('overview reports fill status and constraint table', async () => {
  const res = await getOverview(await adminReq('GET', `/api/admin/overview?weekStart=${WEEK}`));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.dates).toEqual(DATES);
  const statuses = data.technicians.map((t: { status: string }) => t.status);
  expect(statuses.filter((s: string) => s === 'full')).toHaveLength(8);
  expect(statuses.filter((s: string) => s === 'none')).toHaveLength(2);
  expect(data.constraints[String(techIds[0])]['2026-07-19']).toBe('flex');
  expect(data.scheduleStatus).toBeNull();
});

test('overview reports partial status', async () => {
  await prisma.constraint.create({ data: { technicianId: techIds[8], date: DATES[0], value: 'morning' } });
  const res = await getOverview(await adminReq('GET', `/api/admin/overview?weekStart=${WEEK}`));
  const data = await res.json();
  const t9 = data.technicians.find((t: { id: number }) => t.id === techIds[8]);
  expect(t9.status).toBe('partial');
});

test('generate creates a full draft respecting hard rules', async () => {
  const res = await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.status).toBe('draft');
  expect(schedule!.assignments).toHaveLength(40); // 5 days * 2 shifts * 4 stations
  for (const date of DATES) {
    const day = schedule!.assignments.filter(a => a.date === date);
    const ids = day.map(a => a.technicianId);
    expect(new Set(ids).size).toBe(ids.length); // nobody twice per day
  }
});

test('generate regenerates (replaces) an existing draft', async () => {
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));
  const count = await prisma.assignment.count();
  expect(count).toBe(40);
});

test('save schedule replaces assignments and persists includeFriday', async () => {
  const res = await saveSchedule(await adminReq('PUT', '/x', {
    weekStart: WEEK,
    includeFriday: true,
    assignments: [{ date: DATES[0], shift: 'morning', station: 1, technicianId: techIds[0] }],
  }));
  expect(res.status).toBe(200);
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: WEEK }, include: { assignments: true } });
  expect(schedule!.includeFriday).toBe(true);
  expect(schedule!.status).toBe('draft');
  expect(schedule!.assignments).toHaveLength(1);
});

test('technician sees schedule only after publish; admin always', async () => {
  await generate(await adminReq('POST', '/x', { weekStart: WEEK, includeFriday: false }));

  const techBefore = await getSchedule(await techReq(`/api/schedule?weekStart=${WEEK}`, techIds[0]));
  expect((await techBefore.json()).schedule).toBeNull();

  const adminView = await getSchedule(await adminReq('GET', `/api/schedule?weekStart=${WEEK}`));
  expect((await adminView.json()).schedule.status).toBe('draft');

  const pub = await publish(await adminReq('POST', '/x', { weekStart: WEEK }));
  expect(pub.status).toBe(200);

  const techAfter = await getSchedule(await techReq(`/api/schedule?weekStart=${WEEK}`, techIds[0]));
  const data = await techAfter.json();
  expect(data.schedule.status).toBe('published');
  expect(data.schedule.assignments).toHaveLength(40);
  expect(data.technicians.length).toBe(10);
});

test('publish 404s when no schedule exists', async () => {
  expect((await publish(await adminReq('POST', '/x', { weekStart: '2030-01-06' }))).status).toBe(404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/admin-routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the five routes**

`src/app/api/schedule/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.findUnique({
    where: { weekStart },
    include: { assignments: { select: { date: true, shift: true, station: true, technicianId: true } } },
  });
  const visible = schedule && (session.role === 'admin' || schedule.status === 'published');
  const technicians = await prisma.technician.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return Response.json({
    schedule: visible
      ? { status: schedule.status, includeFriday: schedule.includeFriday, assignments: schedule.assignments }
      : null,
    technicians,
  });
}
```

`src/app/api/admin/overview/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates } from '@/lib/dates';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  const dates = weekDates(weekStart, schedule?.includeFriday ?? false);
  const technicians = await prisma.technician.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const rows = await prisma.constraint.findMany({ where: { date: { in: dates } } });

  const byTech: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    (byTech[String(r.technicianId)] ??= {})[r.date] = r.value;
  }

  return Response.json({
    technicians: technicians.map(t => {
      const filled = Object.keys(byTech[String(t.id)] ?? {}).length;
      return {
        id: t.id,
        name: t.name,
        status: filled === dates.length ? 'full' : filled > 0 ? 'partial' : 'none',
      };
    }),
    constraints: byTech,
    dates,
    includeFriday: schedule?.includeFriday ?? false,
    scheduleStatus: schedule?.status ?? null,
  });
}
```

`src/app/api/admin/schedule/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface SaveBody {
  weekStart?: string;
  includeFriday?: boolean;
  assignments?: Array<{ date: string; shift: string; station: number; technicianId: number }>;
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const { weekStart, includeFriday = false, assignments = [] } = body;
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.upsert({
    where: { weekStart },
    update: { includeFriday },
    create: { weekStart, includeFriday, status: 'draft' },
  });
  await prisma.assignment.deleteMany({ where: { scheduleId: schedule.id } });
  await prisma.assignment.createMany({
    data: assignments.map(a => ({ scheduleId: schedule.id, ...a })),
  });
  return Response.json({ ok: true });
}
```

`src/app/api/admin/schedule/generate/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates } from '@/lib/dates';
import { generateAssignments, type ConstraintValue } from '@/lib/scheduler';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { weekStart, includeFriday = false } = body as { weekStart?: string; includeFriday?: boolean };
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const dates = weekDates(weekStart, includeFriday);
  const technicians = await prisma.technician.findMany({ select: { id: true } });
  const rows = await prisma.constraint.findMany({ where: { date: { in: dates } } });

  const constraintsByTech = new Map<number, Record<string, ConstraintValue>>();
  for (const r of rows) {
    if (!constraintsByTech.has(r.technicianId)) constraintsByTech.set(r.technicianId, {});
    constraintsByTech.get(r.technicianId)![r.date] = r.value as ConstraintValue;
  }
  const assignments = generateAssignments(
    dates,
    technicians.map(t => ({ technicianId: t.id, constraints: constraintsByTech.get(t.id) ?? {} }))
  );

  const schedule = await prisma.schedule.upsert({
    where: { weekStart },
    update: { includeFriday, status: 'draft' },
    create: { weekStart, includeFriday, status: 'draft' },
  });
  await prisma.assignment.deleteMany({ where: { scheduleId: schedule.id } });
  await prisma.assignment.createMany({
    data: assignments.map(a => ({ scheduleId: schedule.id, ...a })),
  });
  return Response.json({ ok: true });
}
```

`src/app/api/admin/schedule/publish/route.ts`:
```ts
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { weekStart } = body as { weekStart?: string };
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  if (!schedule) return Response.json({ error: 'אין תוכנית לשבוע זה' }, { status: 404 });
  await prisma.schedule.update({ where: { id: schedule.id }, data: { status: 'published' } });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all test files pass (smoke, dates, scheduler, auth, auth-routes, constraints-routes, admin-routes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/schedule src/app/api/admin tests/admin-routes.test.ts
git commit -m "feat: schedule + admin API - overview, generate, save, publish"
```

---

### Task 8: App shell — home redirect, nav bar, shared client helpers

**Files:**
- Create: `src/components/NavBar.tsx`, `src/components/WeekNav.tsx`, `src/lib/labels.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `verifySessionToken` (`@/lib/auth`), `addDays`/`formatDate` (`@/lib/dates`).
- Produces:
  - `<NavBar name={string} links={Array<{href, label}>} />` — top bar with links + logout button (POSTs `/api/auth/logout`, redirects to `/login`).
  - `<WeekNav weekStart={string} onChange={(newWeekStart: string) => void} />` — right/left arrows ±7 days + week label.
  - `src/lib/labels.ts`: `SHIFT_LABELS`, `CONSTRAINT_LABELS`, `CONSTRAINT_COLORS`, `STATUS_LABELS` maps.

- [ ] **Step 1: Write shared labels**

`src/lib/labels.ts`:
```ts
export const CONSTRAINT_LABELS: Record<string, string> = {
  morning: 'בוקר',
  evening: 'ערב',
  flex: 'גמיש',
  off: 'חופש',
};

export const CONSTRAINT_COLORS: Record<string, string> = {
  morning: 'bg-amber-100 text-amber-800',
  evening: 'bg-indigo-100 text-indigo-800',
  flex: 'bg-green-100 text-green-800',
  off: 'bg-gray-200 text-gray-600',
};

export const SHIFT_LABELS: Record<string, string> = {
  morning: 'בוקר',
  evening: 'ערב',
};

export const STATUS_LABELS: Record<string, string> = {
  full: 'מילא הכל',
  partial: 'מילא חלקית',
  none: 'לא מילא',
};
```

- [ ] **Step 2: Write NavBar and WeekNav**

`src/components/NavBar.tsx`:
```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function NavBar({
  name,
  links,
}: {
  name: string;
  links: Array<{ href: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="bg-white border-b px-4 py-3 flex items-center gap-4 flex-wrap">
      <span className="font-bold">שיבוץ משמרות</span>
      <nav className="flex gap-3">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-2 py-1 rounded ${pathname === l.href ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ms-auto flex items-center gap-3 text-sm">
        <span className="text-gray-500">שלום, {name}</span>
        <button onClick={logout} className="text-red-600 hover:underline">התנתקות</button>
      </div>
    </header>
  );
}
```

`src/components/WeekNav.tsx`:
```tsx
'use client';

import { addDays, formatDate } from '@/lib/dates';

export default function WeekNav({
  weekStart,
  onChange,
}: {
  weekStart: string;
  onChange: (newWeekStart: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 py-3">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        className="px-3 py-1 rounded border bg-white hover:bg-gray-100"
        aria-label="שבוע קודם"
      >
        →
      </button>
      <span className="font-semibold min-w-40 text-center">
        שבוע {formatDate(weekStart)} – {formatDate(addDays(weekStart, 5))}
      </span>
      <button
        onClick={() => onChange(addDays(weekStart, 7))}
        className="px-3 py-1 rounded border bg-white hover:bg-gray-100"
        aria-label="שבוע הבא"
      >
        ←
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Replace home page with session-based redirect**

`src/app/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';

export default async function Home() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect('/login');
  redirect(session.role === 'admin' ? '/admin' : '/constraints');
}
```

- [ ] **Step 4: Verify build and tests**

Run: `npm test` — all pass.
Run: `npm run build`
Expected: build succeeds (pages referenced by NavBar links don't need to exist for build).

- [ ] **Step 5: Commit**

```bash
git add src/components src/lib/labels.ts src/app/page.tsx
git commit -m "feat: app shell - nav bar, week navigation, session redirect"
```

---

### Task 9: Auth pages (register / login / admin-login)

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/admin-login/page.tsx`, `src/components/AuthForm.tsx`

**Interfaces:**
- Consumes: auth API routes from Task 5.
- Produces: pages at `/login`, `/register`, `/admin-login`.

- [ ] **Step 1: Write the shared form component**

`src/components/AuthForm.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface Field {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  minLength?: number;
}

export default function AuthForm({
  title,
  fields,
  endpoint,
  redirectTo,
  footer,
}: {
  title: string;
  fields: Field[];
  endpoint: string;
  redirectTo: string;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setBusy(false);
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'שגיאה לא צפויה');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">{title}</h1>
        {fields.map(f => (
          <label key={f.name} className="block">
            <span className="text-sm text-gray-600">{f.label}</span>
            <input
              type={f.type}
              required
              minLength={f.minLength}
              value={values[f.name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
              className="mt-1 w-full border rounded px-3 py-2"
              dir={f.type === 'email' ? 'ltr' : undefined}
            />
          </label>
        ))}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '...' : title}
        </button>
        {footer && <div className="text-sm text-center text-gray-600">{footer}</div>}
      </form>
    </main>
  );
}

export { Link };
```

- [ ] **Step 2: Write the three pages**

`src/app/login/page.tsx`:
```tsx
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <AuthForm
      title="התחברות טכנאי"
      endpoint="/api/auth/login"
      redirectTo="/constraints"
      fields={[
        { name: 'email', label: 'אימייל', type: 'email' },
        { name: 'password', label: 'סיסמה', type: 'password' },
      ]}
      footer={
        <>
          אין לך חשבון? <Link href="/register" className="text-blue-600 hover:underline">להרשמה</Link>
          {' · '}
          <Link href="/admin-login" className="text-blue-600 hover:underline">כניסת מנהל</Link>
        </>
      }
    />
  );
}
```

`src/app/register/page.tsx`:
```tsx
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function RegisterPage() {
  return (
    <AuthForm
      title="הרשמת טכנאי"
      endpoint="/api/auth/register"
      redirectTo="/constraints"
      fields={[
        { name: 'name', label: 'שם מלא', type: 'text' },
        { name: 'email', label: 'אימייל', type: 'email' },
        { name: 'password', label: 'סיסמה (8 תווים לפחות)', type: 'password', minLength: 8 },
      ]}
      footer={
        <>
          כבר רשום? <Link href="/login" className="text-blue-600 hover:underline">להתחברות</Link>
        </>
      }
    />
  );
}
```

`src/app/admin-login/page.tsx`:
```tsx
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function AdminLoginPage() {
  return (
    <AuthForm
      title="כניסת מנהל"
      endpoint="/api/auth/admin-login"
      redirectTo="/admin"
      fields={[
        { name: 'username', label: 'שם משתמש', type: 'text' },
        { name: 'password', label: 'סיסמה', type: 'password' },
      ]}
      footer={
        <Link href="/login" className="text-blue-600 hover:underline">חזרה לכניסת טכנאים</Link>
      }
    />
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, then:
1. `/register` — register with a 5-char password → browser blocks (minLength); with 8+ → redirected to `/constraints` (404 page for now is OK).
2. Register same email again → red Hebrew error "המייל כבר רשום במערכת".
3. `/login` — wrong password → error; correct → redirect.
4. `/admin-login` — `admin`/`admin123` → redirect to `/admin` (404 for now OK).
5. Forms render RTL, labels in Hebrew, email field LTR.

- [ ] **Step 4: Commit**

```bash
git add src/app/login src/app/register src/app/admin-login src/components/AuthForm.tsx
git commit -m "feat: auth pages - technician register/login, admin login"
```

---

### Task 10: Technician screens — constraints entry + published schedule view

**Files:**
- Create: `src/app/constraints/page.tsx`, `src/app/constraints/ConstraintsClient.tsx`, `src/app/schedule/page.tsx`, `src/app/schedule/ScheduleClient.tsx`, `src/components/ScheduleTable.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/constraints`, `GET /api/schedule`, `WeekNav`, `NavBar`, labels, `weekDates`/`dayName`/`formatDate`/`getCurrentWeekStart`.
- Produces: `/constraints`, `/schedule` pages; `<ScheduleTable assignments technicians dates highlightTechId? />` (read-only view, reused nowhere else but kept separate from the admin editable board).

- [ ] **Step 1: Server wrappers with auth guard**

`src/app/constraints/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import ConstraintsClient from './ConstraintsClient';

export default async function ConstraintsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'technician') redirect('/login');
  return <ConstraintsClient name={session.name} />;
}
```

`src/app/schedule/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import ScheduleClient from './ScheduleClient';

export default async function SchedulePage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'technician') redirect('/login');
  return <ScheduleClient name={session.name} technicianId={session.userId!} />;
}
```

- [ ] **Step 2: Constraints client component**

`src/app/constraints/ConstraintsClient.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { CONSTRAINT_LABELS } from '@/lib/labels';

const TECH_LINKS = [
  { href: '/constraints', label: 'האילוצים שלי' },
  { href: '/schedule', label: 'תוכנית משמרות' },
];

const OPTIONS = ['morning', 'evening', 'flex', 'off'];

export default function ConstraintsClient({ name }: { name: string }) {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [constraints, setConstraints] = useState<Record<string, string>>({});
  const [includeFriday, setIncludeFriday] = useState(false);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/constraints?weekStart=${ws}`);
    if (res.ok) {
      const data = await res.json();
      setConstraints(data.constraints);
      setIncludeFriday(data.includeFriday);
      setPublished(data.published);
    } else {
      setError('שגיאה בטעינת נתונים');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  async function setDay(date: string, value: string) {
    if (published) return;
    const prev = constraints;
    setConstraints({ ...constraints, [date]: value });
    const res = await fetch('/api/constraints', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, value }),
    });
    if (!res.ok) {
      setConstraints(prev);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'השמירה נכשלה');
    }
  }

  const dates = weekDates(weekStart, includeFriday);

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="max-w-2xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {published && (
          <p className="bg-yellow-100 text-yellow-800 rounded p-3 mb-4 text-sm">
            התוכנית לשבוע זה פורסמה — לא ניתן לשנות אילוצים.
          </p>
        )}
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {loading ? (
          <p className="text-center text-gray-500 py-8">טוען...</p>
        ) : (
          <div className="space-y-3">
            {dates.map(date => (
              <div key={date} className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold w-24">
                  {dayName(date)} <span className="text-gray-400 text-sm">{formatDate(date)}</span>
                </span>
                <div className="flex gap-2 flex-wrap">
                  {OPTIONS.map(opt => (
                    <button
                      key={opt}
                      disabled={published}
                      onClick={() => setDay(date, opt)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                        constraints[date] === opt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white hover:bg-gray-100'
                      } ${published ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {CONSTRAINT_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">השינויים נשמרים אוטומטית.</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Read-only schedule table + technician schedule view**

`src/components/ScheduleTable.tsx`:
```tsx
import { dayName, formatDate } from '@/lib/dates';
import { SHIFT_LABELS } from '@/lib/labels';

export interface AssignmentView {
  date: string;
  shift: string;
  station: number;
  technicianId: number;
}

export default function ScheduleTable({
  dates,
  assignments,
  technicians,
  highlightTechId,
}: {
  dates: string[];
  assignments: AssignmentView[];
  technicians: Array<{ id: number; name: string }>;
  highlightTechId?: number;
}) {
  const nameOf = (id: number) => technicians.find(t => t.id === id)?.name ?? '?';
  const cell = (date: string, shift: string, station: number) =>
    assignments.find(a => a.date === date && a.shift === shift && a.station === station);

  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100">משמרת / עמדה</th>
            {dates.map(d => (
              <th key={d} className="border p-2 bg-gray-100">
                {dayName(d)}
                <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['morning', 'evening'] as const).map(shift =>
            [1, 2, 3, 4].map(station => (
              <tr key={`${shift}-${station}`}>
                <td className="border p-2 bg-gray-50 whitespace-nowrap">
                  {SHIFT_LABELS[shift]} · עמדה {station}
                </td>
                {dates.map(date => {
                  const a = cell(date, shift, station);
                  const mine = a && a.technicianId === highlightTechId;
                  return (
                    <td
                      key={date}
                      className={`border p-2 text-center ${
                        !a ? 'bg-red-50 text-red-400' : mine ? 'bg-blue-100 font-bold' : ''
                      }`}
                    >
                      {a ? nameOf(a.technicianId) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

`src/app/schedule/ScheduleClient.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import ScheduleTable, { type AssignmentView } from '@/components/ScheduleTable';
import { getCurrentWeekStart, weekDates } from '@/lib/dates';

const TECH_LINKS = [
  { href: '/constraints', label: 'האילוצים שלי' },
  { href: '/schedule', label: 'תוכנית משמרות' },
];

interface ScheduleData {
  schedule: { status: string; includeFriday: boolean; assignments: AssignmentView[] } | null;
  technicians: Array<{ id: number; name: string }>;
}

export default function ScheduleClient({ name, technicianId }: { name: string; technicianId: number }) {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [data, setData] = useState<ScheduleData | null>(null);

  const load = useCallback(async (ws: string) => {
    setData(null);
    const res = await fetch(`/api/schedule?weekStart=${ws}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="max-w-5xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {!data ? (
          <p className="text-center text-gray-500 py-8">טוען...</p>
        ) : !data.schedule ? (
          <p className="text-center text-gray-500 py-8">טרם פורסמה תוכנית לשבוע זה.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">המשמרות שלך מודגשות בכחול.</p>
            <ScheduleTable
              dates={weekDates(weekStart, data.schedule.includeFriday)}
              assignments={data.schedule.assignments}
              technicians={data.technicians}
              highlightTechId={technicianId}
            />
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`:
1. Log in as technician → `/constraints` shows Sun–Thu cards, week nav arrows work.
2. Click בוקר on a day → button turns blue; refresh page → selection persists.
3. `/schedule` → "טרם פורסמה תוכנית לשבוע זה."
4. Narrow browser to phone width → layout wraps, no horizontal page scroll (table scrolls internally).

- [ ] **Step 5: Commit**

```bash
git add src/app/constraints src/app/schedule src/components/ScheduleTable.tsx
git commit -m "feat: technician screens - weekly constraints entry and schedule view"
```

---

### Task 11: Admin dashboard (overview)

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/AdminDashboardClient.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/overview`, `NavBar`, `WeekNav`, labels, dates utils.
- Produces: `/admin` page. `ADMIN_LINKS` constant duplicated in Task 12's board (two links: `/admin` "לוח בקרה", `/admin/schedule` "תוכנית משמרות").

- [ ] **Step 1: Server wrapper**

`src/app/admin/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/admin-login');
  return <AdminDashboardClient />;
}
```

- [ ] **Step 2: Dashboard client**

`src/app/admin/AdminDashboardClient.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import { getCurrentWeekStart, dayName, formatDate } from '@/lib/dates';
import { CONSTRAINT_LABELS, CONSTRAINT_COLORS, STATUS_LABELS } from '@/lib/labels';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
];

const STATUS_COLORS: Record<string, string> = {
  full: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  none: 'bg-red-100 text-red-800',
};

interface Overview {
  technicians: Array<{ id: number; name: string; status: string }>;
  constraints: Record<string, Record<string, string>>;
  dates: string[];
  scheduleStatus: string | null;
}

export default function AdminDashboardClient() {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async (ws: string) => {
    setData(null);
    const res = await fetch(`/api/admin/overview?weekStart=${ws}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-5xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {!data ? (
          <p className="text-center text-gray-500 py-8">טוען...</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="text-gray-500">סטטוס תוכנית:</span>
              <span className="font-semibold">
                {data.scheduleStatus === 'published' ? 'פורסמה' : data.scheduleStatus === 'draft' ? 'טיוטה' : 'אין תוכנית'}
              </span>
            </div>
            <h2 className="font-bold mb-2">אילוצי טכנאים</h2>
            {data.technicians.length === 0 ? (
              <p className="text-gray-500">אין עדיין טכנאים רשומים.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100 text-start">טכנאי</th>
                      <th className="border p-2 bg-gray-100">סטטוס</th>
                      {data.dates.map(d => (
                        <th key={d} className="border p-2 bg-gray-100">
                          {dayName(d)}
                          <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map(t => (
                      <tr key={t.id}>
                        <td className="border p-2 font-semibold whitespace-nowrap">{t.name}</td>
                        <td className="border p-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[t.status]}`}>
                            {STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        {data.dates.map(date => {
                          const v = data.constraints[String(t.id)]?.[date];
                          return (
                            <td key={date} className="border p-2 text-center">
                              {v ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${CONSTRAINT_COLORS[v]}`}>
                                  {CONSTRAINT_LABELS[v]}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`:
1. Log in as admin → `/admin` shows the table; technicians with constraints show colored chips, status badges correct.
2. Technician with no constraints shows "לא מילא" red badge.
3. Week arrows reload data.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/AdminDashboardClient.tsx
git commit -m "feat: admin dashboard - technician list and constraints table"
```

---

### Task 12: Admin schedule board (generate / edit / save / publish)

**Files:**
- Create: `src/app/admin/schedule/page.tsx`, `src/app/admin/schedule/AdminScheduleClient.tsx`

**Interfaces:**
- Consumes: `GET /api/schedule`, `GET /api/admin/overview`, `POST /api/admin/schedule/generate`, `PUT /api/admin/schedule`, `POST /api/admin/schedule/publish`.
- Produces: `/admin/schedule` page.

- [ ] **Step 1: Server wrapper**

`src/app/admin/schedule/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminScheduleClient from './AdminScheduleClient';

export default async function AdminSchedulePage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/admin-login');
  return <AdminScheduleClient />;
}
```

- [ ] **Step 2: Board client**

Board state: `cells: Record<"date|shift|station", number | ''>` (empty string = unassigned). Warnings computed live: technician assigned against constraint, or twice same day. Empty cell → red background.

`src/app/admin/schedule/AdminScheduleClient.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { SHIFT_LABELS, CONSTRAINT_LABELS } from '@/lib/labels';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
];

const SHIFTS = ['morning', 'evening'] as const;
const STATIONS = [1, 2, 3, 4];

type CellKey = string; // `${date}|${shift}|${station}`
const key = (date: string, shift: string, station: number): CellKey => `${date}|${shift}|${station}`;

interface Tech { id: number; name: string }

export default function AdminScheduleClient() {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [includeFriday, setIncludeFriday] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<CellKey, number | ''>>({});
  const [technicians, setTechnicians] = useState<Tech[]>([]);
  const [constraints, setConstraints] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setMessage('');
    const [schedRes, overviewRes] = await Promise.all([
      fetch(`/api/schedule?weekStart=${ws}`),
      fetch(`/api/admin/overview?weekStart=${ws}`),
    ]);
    if (schedRes.ok && overviewRes.ok) {
      const sched = await schedRes.json();
      const overview = await overviewRes.json();
      setTechnicians(sched.technicians);
      setConstraints(overview.constraints);
      setIncludeFriday(sched.schedule?.includeFriday ?? overview.includeFriday ?? false);
      setStatus(sched.schedule?.status ?? null);
      const next: Record<CellKey, number | ''> = {};
      for (const a of sched.schedule?.assignments ?? []) {
        next[key(a.date, a.shift, a.station)] = a.technicianId;
      }
      setCells(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const dates = weekDates(weekStart, includeFriday);

  const assignmentsPayload = useMemo(
    () =>
      Object.entries(cells)
        .filter(([, techId]) => techId !== '')
        .map(([k, technicianId]) => {
          const [date, shift, station] = k.split('|');
          return { date, shift, station: Number(station), technicianId: technicianId as number };
        }),
    [cells]
  );

  const shiftCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of assignmentsPayload) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
    return counts;
  }, [assignmentsPayload]);

  function warningsFor(date: string, shift: string, techId: number | ''): string | null {
    if (techId === '') return null;
    const c = constraints[String(techId)]?.[date];
    const okByConstraint = c === shift || c === 'flex';
    const timesToday = assignmentsPayload.filter(a => a.date === date && a.technicianId === techId).length;
    if (timesToday > 1) return 'משובץ פעמיים באותו יום';
    if (!okByConstraint) return c ? `אילוץ: ${CONSTRAINT_LABELS[c]}` : 'לא מילא אילוץ';
    return null;
  }

  async function saveDraft(overrideFriday?: boolean): Promise<boolean> {
    const res = await fetch('/api/admin/schedule', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        weekStart,
        includeFriday: overrideFriday ?? includeFriday,
        assignments: assignmentsPayload,
      }),
    });
    setMessage(res.ok ? 'הטיוטה נשמרה' : 'השמירה נכשלה');
    if (res.ok && status === null) setStatus('draft');
    return res.ok;
  }

  async function toggleFriday(value: boolean) {
    setIncludeFriday(value);
    await saveDraft(value);
  }

  async function generate() {
    if (Object.keys(cells).length > 0 && !confirm('יצירת תוכנית תדרוס את השיבוץ הקיים. להמשיך?')) return;
    const res = await fetch('/api/admin/schedule/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weekStart, includeFriday }),
    });
    if (res.ok) {
      setMessage('נוצרה תוכנית חדשה');
      await load(weekStart);
    } else {
      setMessage('יצירת התוכנית נכשלה');
    }
  }

  async function publish() {
    if (!(await saveDraft())) return;
    const res = await fetch('/api/admin/schedule/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weekStart }),
    });
    if (res.ok) {
      setStatus('published');
      setMessage('התוכנית פורסמה! הטכנאים יכולים לצפות בה.');
    } else {
      setMessage('הפרסום נכשל');
    }
  }

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-6xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {loading ? (
          <p className="text-center text-gray-500 py-8">טוען...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={generate} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                צור תוכנית
              </button>
              <button onClick={() => saveDraft()} className="bg-white border rounded px-4 py-2 hover:bg-gray-100">
                שמור טיוטה
              </button>
              <button onClick={publish} className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700">
                פרסם
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeFriday} onChange={e => toggleFriday(e.target.checked)} />
                כולל שישי
              </label>
              <span className="ms-auto text-sm text-gray-500">
                סטטוס: {status === 'published' ? 'פורסמה' : status === 'draft' ? 'טיוטה' : 'אין תוכנית'}
              </span>
            </div>
            {message && <p className="text-sm text-blue-700 mb-3">{message}</p>}
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100">משמרת / עמדה</th>
                    {dates.map(d => (
                      <th key={d} className="border p-2 bg-gray-100">
                        {dayName(d)}
                        <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map(shift =>
                    STATIONS.map(station => (
                      <tr key={`${shift}-${station}`}>
                        <td className="border p-2 bg-gray-50 whitespace-nowrap">
                          {SHIFT_LABELS[shift]} · עמדה {station}
                        </td>
                        {dates.map(date => {
                          const k = key(date, shift, station);
                          const techId = cells[k] ?? '';
                          const warning = warningsFor(date, shift, techId);
                          return (
                            <td key={date} className={`border p-1 ${techId === '' ? 'bg-red-50' : ''}`}>
                              <select
                                value={techId}
                                onChange={e =>
                                  setCells(c => ({ ...c, [k]: e.target.value === '' ? '' : Number(e.target.value) }))
                                }
                                className="w-full border-0 bg-transparent text-center"
                              >
                                <option value="">— ריק —</option>
                                {technicians.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                              {warning && <div className="text-xs text-orange-600 text-center">⚠ {warning}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <h3 className="font-bold mt-6 mb-2">משמרות לטכנאי (איזון)</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {technicians.map(t => (
                <span key={t.id} className="bg-white border rounded-full px-3 py-1">
                  {t.name}: {shiftCounts.get(t.id) ?? 0}
                </span>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. With ~10 registered technicians who filled constraints (register a few via the UI or reuse test data by running the app once and registering manually):
1. Admin → `/admin/schedule` → "צור תוכנית" fills the grid; empty stations (if any) show red.
2. Change a cell to a technician whose constraint is חופש → orange ⚠ warning appears; still allowed.
3. Assign the same technician morning+evening same day → "משובץ פעמיים באותו יום" warning.
4. "שמור טיוטה" → reload page → assignments persist.
5. "פרסם" → status becomes פורסמה; technician's `/schedule` now shows the table with own shifts highlighted; technician's `/constraints` becomes locked.
6. Friday toggle on → Friday column appears; technician constraints screen now shows Friday too.
7. Regenerate → confirm dialog appears.

- [ ] **Step 4: Full test suite + build**

Run: `npm test` — all pass.
Run: `npm run build` — succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/schedule
git commit -m "feat: admin schedule board - generate, manual edit, draft, publish"
```

---

### Task 13: Deploy to Vercel + Neon (guided, interactive)

**Files:**
- Modify: `prisma/schema.prisma` (provider), `.env` (local stays SQLite? No — switch dev to Neon too, or keep two: see steps)

**Interfaces:**
- Consumes: finished app.
- Produces: public URL.

**NOTE: This task requires the user to create free accounts (Neon, Vercel, GitHub optional). Do it together with the user; browser logins are interactive (`! npx vercel login` style).**

- [ ] **Step 1: Create Neon database**

Guide user: sign up at https://neon.tech (free tier), create project "shift-scheduler", copy the connection string (`postgresql://...`).

- [ ] **Step 2: Switch Prisma provider to postgresql**

In `prisma/schema.prisma` change:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
Update `.env` `DATABASE_URL` to the Neon string. Run: `npx prisma db push` — creates tables in Neon.
Note: tests keep working only against SQLite; after the provider switch run tests by temporarily reverting provider, or accept that CI-style tests ran pre-switch. Simplest: keep this as the final step; tests already green.

- [ ] **Step 3: Generate a production JWT secret**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — save output.

- [ ] **Step 4: Deploy with Vercel CLI**

User signs up at https://vercel.com. Then:
```bash
npx vercel login    # interactive — user runs with ! prefix
npx vercel link
npx vercel env add DATABASE_URL production    # paste Neon URL
npx vercel env add JWT_SECRET production      # paste generated secret
npx vercel --prod
```
Expected: deployment URL printed.

- [ ] **Step 5: Smoke-test production**

On the live URL: register a technician, fill constraints, admin login, generate, publish, view as technician.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "chore: switch Prisma provider to postgresql for production"
```

---

## Self-Review Notes

- Spec coverage: registration/login (T5, T9), constraints entry + auto-save + lock (T6, T10), published schedule view with highlight (T7, T10), admin overview + statuses (T7, T11), generate/manual-edit/draft/publish + Friday toggle + balance row + red empty cells + warnings (T3, T7, T12), deploy (T13). Friday-toggle-persists-before-generate: `toggleFriday` calls `saveDraft` which upserts the Schedule row — covered.
- Manual edits may violate rules (warning only) — server intentionally does NOT validate `PUT /api/admin/schedule` assignments against constraints (spec: admin decides).
- Type consistency: `Session`, `TechAvailability`, `GeneratedAssignment`, assignment shape `{date, shift, station, technicianId}` used identically across tasks.
