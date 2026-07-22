import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Self-service absence entry for technicians: lets a technician mark their own
// vacation/sick/miluim/other dates, without needing an admin to enter it for them.
// Scoped strictly to the caller's own technicianId (never client-supplied) so a
// technician can only create/delete their own absence records.
//
// These rows land in the same `Absence` table the admin panel writes to, so the
// existing enforcement (board dropdown filter, PUT /api/admin/schedule save-block,
// and the auto-generate exclusion) already respects self-reported absences with
// no further changes.

const TYPES = ['vacation', 'sick', 'miluim', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// All of the caller's own absence records, past/present/future — unlike
// /api/my-vacations (which is scoped to the current calendar year for the
// annual-usage summary), this lets a technician see their full history.
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const rows = await prisma.absence.findMany({
    where: { technicianId: session.userId! },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
  return Response.json({
    absences: rows.map(a => ({ id: a.id, startDate: a.startDate, endDate: a.endDate, type: a.type })),
  });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  const endDate = typeof body.endDate === 'string' ? body.endDate : '';
  const type = typeof body.type === 'string' ? body.type : '';
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate || !TYPES.includes(type)) {
    return Response.json({ error: 'נתוני היעדרות לא תקינים' }, { status: 400 });
  }
  await prisma.absence.create({ data: { technicianId: session.userId!, startDate, endDate, type } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  // Scoped delete: technicianId must match the session, so a technician can never
  // delete someone else's absence record by guessing an id.
  await prisma.absence.deleteMany({ where: { id: body.id, technicianId: session.userId! } });
  return Response.json({ ok: true });
}
