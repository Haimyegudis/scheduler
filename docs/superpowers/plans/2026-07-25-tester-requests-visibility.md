# Tester Requests Visibility & Admin Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Executed inline by the session that authored it (full context held); steps use checkbox syntax.

**Goal:** Testers see all testers' requests per day; admin gets a dedicated tab of requests grouped by day with manual add on a tester's behalf.

**Spec:** `docs/superpowers/specs/2026-07-25-tester-requests-visibility-design.md`

## Global Constraints

Same as the tester-role plan: Hebrew server errors + `apiErrorMap` mirror, he+en dict keys, sqlite provider locally, vitest route-handler test pattern, best-effort push, commit per task.

---

### Task 1: API — tester feed, admin upcoming list, admin create, place-on-board approve

**Files:**
- Modify: `src/app/api/tester-requests/route.ts` (GET adds `all`)
- Modify: `src/app/api/admin/tester-requests/route.ts` (GET optional weekStart; new POST; PUT `place` flag)
- Test: `tests/tester-requests-routes.test.ts`, `tests/admin-tester-requests-routes.test.ts`

**Interfaces produced:**
- Tester `GET /api/tester-requests` → `{ requests, stations, all: Array<{ id, date, shift, stationId, station, status, description, tester: { name } }> }`, `all` = every tester, `date >= today`, ordered date asc, shift asc.
- Admin `GET /api/admin/tester-requests` (no `weekStart`) → same shape, `date >= today`.
- Admin `POST /api/admin/tester-requests` `{ testerId, date, shift, stationId?, description, swVersion?, hwNotes? }` → 200 `{ ok }`; 400 invalid fields / non-tester testerId (error `'נתונים לא תקינים'`).
- Admin `PUT` approve with `place: true` → also upserts draft schedule + assignment (append `experimenter`, comma-separated; `technicianId` untouched/null).

- [ ] Steps: failing tests (feed cross-tester + future-only; GET without weekStart; POST on-behalf + non-tester 400; PUT place creates schedule/assignment + appends) → run red → implement → run green → commit.

### Task 2: Tester UI — requests-by-day section

**Files:**
- Modify: `src/app/requests/RequestsClient.tsx`, `src/lib/i18n-dict.ts`

- [ ] Add `all` to load state; group by date; render section `allRequestsHeading` ('בקשות לפי יום' / 'Requests by day') with day headers (`dayName` + `formatDate`) and rows: tester name · `shiftLabel` · press or `anyPressOption` · status chip. Hidden when empty. Typecheck. Commit.

### Task 3: Admin tab — page, nav links, manual add

**Files:**
- Create: `src/app/admin/tester-requests/page.tsx`, `src/app/admin/tester-requests/AdminTesterRequestsClient.tsx`
- Modify: nav `ADMIN_LINKS_KEYS` in all 5 admin clients + new page, `src/lib/i18n-dict.ts`

- [ ] Page guard mirrors other admin pages. Client loads `GET /api/admin/tester-requests` (upcoming), `GET /api/admin/users` (role === 'tester' for dropdown), `GET /api/admin/stations`. Renders: manual-add form (tester dropdown, date, shift, press optional, description required, SW/HW) → POST; grouped-by-day list with status chips; pending rows get press pick + Approve (confirm dialog, PUT `place: true`) + Reject. New keys: `testerRequestsNav`, `addRequestManuallyHeading`, `selectTesterLabel`, `addBtn` (exists), `approvePlaceConfirm`, `requestAddedMsg`, `noUpcomingRequests`. Typecheck. Commit.

### Task 4: Verification

- [ ] `npm test` + `npx tsc --noEmit` + `npm run build` green. Commit any fixes.
