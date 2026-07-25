# Tester Placement via Board Dropdown — Design

Date: 2026-07-25
Status: Approved by user
Extends: 2026-07-25-tester-requests-visibility-design.md

## Goal

Replace the tester-requests card on the admin schedule board with in-cell placement:
the experimenter field becomes a dropdown of testers who requested that day, with a
manual free-text option. Placement is approval. Published schedule shows tester name,
request description, and the assigned technician.

## Behavior

- **Board cell (edit view):** experimenter dropdown lists testers with a request on
  that date (any shift), labeled `name · requested morning/evening`. Options: empty,
  each requester, "manual entry" (switches to the existing free-text input; non-matching
  existing values render as text input directly). Requests card removed from this page
  (the dedicated admin tab keeps overview / manual add / reject).
- **Cross-shift placement allowed:** tester who asked morning can be placed in evening
  of the same day; the cell then shows an orange warning `ביקש: בוקר` (same pattern as
  technician constraint warnings). Comma-separated multiple names are each checked.
- **Approval = placement, reconciled on save:** `PUT /api/admin/schedule` reconciles
  that week's non-rejected requests after saving: tester's name appears in some
  assignment's experimenter on the requested date → `status = approved`,
  `assignedStationId` = that assignment's station (prefer an assignment on the
  requested shift). Name absent → back to `pending`, `assignedStationId = null`.
  `rejected` requests are never touched.
- **Final view:** `GET /api/schedule` returns `testerRequests` — approved requests on
  the schedule's dates (`{ date, description, testerName }`). `ScheduleTable` shows,
  under the experimenter line, the description of each request whose tester name is in
  the cell's experimenter and whose date matches. Technician display unchanged.

## Out of scope

- Push on auto-approve (publish push already notifies everyone; per-save pushes would spam).
- The admin tab flow (approve with `place: true`) stays as is.
