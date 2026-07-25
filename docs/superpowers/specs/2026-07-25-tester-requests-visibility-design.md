# Tester Requests Visibility & Admin Requests Tab — Design

Date: 2026-07-25
Status: Approved by user
Extends: 2026-07-25-tester-role-design.md

## Goal

1. Every tester sees, on their requests page, the names of all testers who requested a
   machine per day (e.g. 4 testers requested Monday → all 4 names visible). Empty day →
   nothing shown. The tester's own request form stays — manual submission is always
   possible regardless of how many requests a day has.
2. Admin gets a dedicated nav tab "בקשות נסיינים" listing all requests grouped by day —
   who requested what and where — plus the ability to manually add a request in a
   tester's name when changes are needed.

## API changes

- `GET /api/tester-requests` (tester): response gains `all` — every tester's requests
  from today onward, each with `tester: { name }` and `station: { name } | null`,
  ordered by date then shift. Own `requests` list unchanged.
- `GET /api/admin/tester-requests`: `weekStart` becomes optional. With it — current
  week-filtered behavior (board panel). Without it — all requests from today onward
  (new admin tab).
- `POST /api/admin/tester-requests` (new): admin creates a request on a tester's
  behalf. Body `{ testerId, date, shift, stationId?, description, swVersion?, hwNotes? }`.
  Same field validation as the tester POST; testerId must be a user with role `tester`.
  No published-week block (admin controls the board). Status starts `pending`.
- `PUT /api/admin/tester-requests` gains optional `place: boolean` on approve. When
  true, the server also places the tester on the board: upsert the week's schedule
  (draft if missing), then upsert the assignment row for (date, shift, stationId) —
  append the tester's name to `experimenter` (comma-separated if occupied), technician
  untouched (null if new row). The board panel keeps client-side placement and calls
  without `place`; the new tab calls with `place: true`.

## Tester UI

- `/requests` gains a section "בקשות לפי יום": all upcoming requests grouped by date
  (day header), each row: tester name · shift · press or "any" · status chip. No rows →
  section hidden.

## Admin UI

- New page `/admin/tester-requests` + nav link added to every admin page's links.
- Requests grouped by day, date-ascending: tester name, shift, press or "any",
  description, SW/HW, status chip.
- Pending rows: press picker (prefilled from request) + Approve (calls PUT with
  `place: true`, after a confirm dialog) + Reject. The alone-on-press warning remains a
  board-only check; the confirm text reminds the admin to check the board.
- Manual add form: tester dropdown (users with role `tester`), date, shift, optional
  press, required description, optional SW/HW → creates pending request.
- Free-text names without an account stay possible directly in the board's experimenter
  cell — not duplicated here.

## Testing

- Tester GET returns `all` across testers, future-dated only.
- Admin GET without weekStart returns upcoming; with weekStart unchanged.
- Admin POST validates and creates on behalf; rejects non-tester testerId.
- PUT approve with `place: true` creates draft schedule + assignment with experimenter;
  appends to an occupied experimenter cell.

## Out of scope (YAGNI)

- Editing/deleting requests from the admin tab (reject covers it).
- Alone-on-press detection in the admin tab.
- Requests for people without a tester account.
