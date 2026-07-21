import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return Response.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 });
  }
  const rows = await prisma.assignment.findMany({
    where: { date: { gte: from, lte: to }, schedule: { status: 'published' } },
    include: { technician: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }, { station: 'asc' }],
  });
  return Response.json({
    assignments: rows.map(a => ({
      date: a.date,
      shift: a.shift,
      station: a.station,
      technicianId: a.technicianId,
      technicianName: a.technician.name,
    })),
  });
}
