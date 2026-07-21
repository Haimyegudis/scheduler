import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const TYPES = ['vacation', 'sick', 'miluim', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const rows = await prisma.absence.findMany({
    include: { technician: { select: { name: true } } },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
  return Response.json({
    absences: rows.map(a => ({
      id: a.id,
      technicianId: a.technicianId,
      technicianName: a.technician.name,
      startDate: a.startDate,
      endDate: a.endDate,
      type: a.type,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const technicianId = body.technicianId;
  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  const endDate = typeof body.endDate === 'string' ? body.endDate : '';
  const type = typeof body.type === 'string' ? body.type : '';
  if (
    typeof technicianId !== 'number' ||
    !DATE_RE.test(startDate) ||
    !DATE_RE.test(endDate) ||
    startDate > endDate ||
    !TYPES.includes(type)
  ) {
    return Response.json({ error: 'נתוני היעדרות לא תקינים' }, { status: 400 });
  }
  const tech = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!tech) return Response.json({ error: 'עובד לא נמצא' }, { status: 404 });
  if (tech.isAdmin) return Response.json({ error: 'לא ניתן להזין היעדרות למנהל' }, { status: 400 });
  await prisma.absence.create({ data: { technicianId, startDate, endDate, type } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  await prisma.absence.deleteMany({ where: { id: body.id } });
  return Response.json({ ok: true });
}
