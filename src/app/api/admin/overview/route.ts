import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf } from '@/lib/dates';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart || !DATE_RE.test(weekStart) || weekStartOf(weekStart) !== weekStart) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }

  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  const dates = weekDates(weekStart, schedule?.includeFriday ?? false);
  const technicians = await prisma.technician.findMany({
    where: { isAdmin: false },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const rows = await prisma.constraint.findMany({ where: { date: { in: dates } } });

  const byTech: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    (byTech[String(r.technicianId)] ??= {})[r.date] = r.value;
  }

  const absenceRows = await prisma.absence.findMany({
    where: { startDate: { lte: dates[dates.length - 1] }, endDate: { gte: dates[0] } },
  });
  const absByTech: Record<string, Record<string, string>> = {};
  for (const a of absenceRows) {
    for (const d of dates) {
      if (a.startDate <= d && d <= a.endDate) (absByTech[String(a.technicianId)] ??= {})[d] = a.type;
    }
  }

  return Response.json({
    technicians: technicians.map(t => {
      const filled = dates.filter(
        d => byTech[String(t.id)]?.[d] || absByTech[String(t.id)]?.[d]
      ).length;
      return {
        id: t.id,
        name: t.name,
        status: filled === dates.length ? 'full' : filled > 0 ? 'partial' : 'none',
      };
    }),
    constraints: byTech,
    absences: absByTech,
    dates,
    includeFriday: schedule?.includeFriday ?? false,
    scheduleStatus: schedule?.status ?? null,
  });
}
