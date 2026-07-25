# Tester Role & Machine Requests — Design

Date: 2026-07-25
Status: Approved by user

## Goal

Add a third user role, **tester** (נסיין), alongside technician and admin. A tester cannot
edit schedules, constraints, or vacations. A tester can submit **shift requests** for a
machine (press): a specific date and shift, with a required description of the experiment
purpose and optional specific press, software version, and hardware requirements. The admin
reviews requests while building the schedule and assigns testers onto presses; approval
places the tester in the existing `experimenter` slot of an assignment, alongside the
assigned worker.

## Key decisions (from brainstorming)

- **Request flow:** admin approves. Requests go to a pending list; admin approves or
  rejects. On approval the tester lands on the schedule as the `experimenter` of the
  matching assignment. Tester is notified.
- **Request fields:** specific press is optional ("any" allowed). SW version and HW
  requirement are optional free text. Description (experiment purpose) is required.
- **Placement:** tester sits alongside the worker on the press shift (fills the existing
  `experimenter` field; the technician stays).
- **Alone rule:** a tester must have a worker beside them — approving a request onto a
  press/shift with no technician triggers a warning dialog. Admin may override and confirm
  placing the tester alone. Soft constraint, not a hard block.

## Data model

- `Technician.role String @default("technician")` — values: `technician | admin | tester`.
  `isAdmin` stays; admin check is `isAdmin || role === 'admin'`. Registration continues via
  the AllowedEmail flow; admin sets role on the users page.
- New model:

```prisma
model TesterRequest {
  id           Int         @id @default(autoincrement())
  testerId     Int
  tester       Technician  @relation(fields: [testerId], references: [id], onDelete: Cascade)
  date         String
  shift        String      // 'morning' | 'evening'
  stationId    Int?        // requested press, null = any
  station      Station?    @relation(fields: [stationId], references: [id])
  swVersion    String?
  hwNotes     String?
  description  String      // experiment purpose, required
  status            String   @default("pending") // pending | approved | rejected
  assignedStationId Int?     // set on approve; not an Assignment FK — assignment rows are
                             // deleted and recreated on every board save, so their IDs are unstable
  createdAt    DateTime    @default(now())
}
```

- Neon production migration SQL file following the existing `neon-migrate-task*.sql`
  pattern (ALTER TABLE for role column, CREATE TABLE for TesterRequest).

## Auth / permissions

- `Session.role` type extended to `'technician' | 'admin' | 'tester'`.
- Tester blocked from: constraint editing, vacation/absence editing, all admin APIs.
- Tester allowed: view published schedule, create own requests, cancel own pending
  requests, view own request history.

## Tester UI

- Nav for tester: Schedule (read-only) and "My Requests".
- Request form: date picker, shift toggle (morning/evening), press dropdown with "any
  press" option, description textarea (required), SW version text input, HW requirement
  text input.
- Own-requests list with status chips (pending/approved/rejected); cancel while pending.

## Admin UI

- Admin schedule page: pending-requests panel for the displayed week. Each request shows
  tester name, date/shift, requested press or "any", description, SW/HW. Actions:
  - **Approve** → choose press (prefilled from request when specified) → writes tester
    name into the assignment's `experimenter` field and records `assignedStationId`.
  - **Reject** → status flips to rejected (no reason field — YAGNI).
- Alone rule: approving onto a press/shift whose assignment has no technician shows a
  confirmation dialog ("Tester will be alone on this press") with override.
- Users page: role selector (worker / tester / admin) per user.

## Notifications

- New request → push to admins (existing push infrastructure).
- Approve/reject → push to the requesting tester.

## Testing

- Vitest coverage: auth guards (tester denied on admin/constraint routes), request
  lifecycle (create → approve → assignment linked), alone-rule detection as a pure
  function.

## Out of scope (YAGNI)

- Managed SW/HW catalogs and dropdowns.
- Machine availability calendar / automatic conflict detection.
- Auto-placement of requests into the generated schedule.
