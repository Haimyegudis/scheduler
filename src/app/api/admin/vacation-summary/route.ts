import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetweenInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return Response.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 });
  }

  const technicians = await prisma.technician.findMany({
    where: { isAdmin: false },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const absences = await prisma.absence.findMany({
    where: { startDate: { lte: to }, endDate: { gte: from } },
  });
  const offRows = await prisma.constraint.findMany({
    where: { value: 'off', date: { gte: from, lte: to } },
    select: { technicianId: true },
  });

  const summary = technicians.map(t => {
    const counts = { vacation: 0, sick: 0, miluim: 0, other: 0 };
    for (const a of absences) {
      if (a.technicianId !== t.id) continue;
      const start = a.startDate > from ? a.startDate : from;
      const end = a.endDate < to ? a.endDate : to;
      const key = (a.type in counts ? a.type : 'other') as keyof typeof counts;
      counts[key] += daysBetweenInclusive(start, end);
    }
    const offMarked = offRows.filter(r => r.technicianId === t.id).length;
    return {
      technicianId: t.id,
      name: t.name,
      ...counts,
      offMarked,
      total: counts.vacation + counts.sick + counts.miluim + counts.other,
    };
  });

  return Response.json({ summary });
}
