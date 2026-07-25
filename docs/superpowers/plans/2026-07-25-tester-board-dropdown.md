# Tester Board Dropdown Implementation Plan

> Executed inline by the authoring session (superpowers:executing-plans). Spec: `docs/superpowers/specs/2026-07-25-tester-board-dropdown-design.md`. Global constraints as prior plans.

### Task 1: Server — reconcile on save + schedule GET testerRequests

- Modify `src/app/api/admin/schedule/route.ts`: after the save transaction, load week's requests (`date in weekDates(weekStart, true)`, `status != 'rejected'`) with tester names; comma-split each saved assignment's experimenter; per request pick assignments on its date containing its tester's name (prefer requested-shift match) → approved + assignedStationId, else pending + null.
- Modify `src/app/api/schedule/route.ts`: when schedule visible, add `testerRequests`: approved requests on the schedule dates → `{ date, description, testerName }`.
- Tests (`tests/admin-routes.test.ts`): save with tester name in experimenter approves request + sets station; resave without name reverts to pending; rejected stays rejected; `GET /api/schedule` returns testerRequests for published week.

- [ ] red → green → commit

### Task 2: Admin board — dropdown cell + warning, remove card

- `AdminScheduleClient.tsx`: delete requests panel JSX + `approveRequest`/`rejectRequest`/`requestStationPick`; keep `testerRequests` fetch/state (feeds dropdowns). Add `manualCells: Record<CellKey, boolean>`. Cell experimenter renders: requester-dropdown (requests for that date; value matches name) with `manual entry` option; manual mode or non-matching value → free-text input with clear-back button. Warning helper: names in cell experimenter with a request that date but different shift → `⚠ {t('testerRequestedPrefix')} {shiftLabel}`.
- i18n: `manualEntryOption` ('הזנה ידנית'/'Manual entry'), `testerRequestedPrefix` ('ביקש:'/'Requested:').

- [ ] implement → typecheck → commit

### Task 3: Final-view description

- `ScheduleTable.tsx`: optional prop `testerRequests?: Array<{ date: string; description: string; testerName: string }>`; under experimenter line render matching descriptions (name ∈ experimenter comma-split, same date) as small italic text.
- Pass prop: `ScheduleClient.tsx` (from GET response) and `AdminScheduleClient.tsx` cleanView (fetch response already in `load`; store `scheduleTesterRequests`).

- [ ] implement → typecheck → commit

### Task 4: Verify

- [ ] `npm test` + `npx tsc --noEmit` + `npm run build` green → commit docs.
