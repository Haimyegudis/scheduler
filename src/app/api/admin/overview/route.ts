import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates } from '@/lib/dates';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

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

  return Response.json({
    technicians: technicians.map(t => {
      const filled = Object.keys(byTech[String(t.id)] ?? {}).length;
      return {
        id: t.id,
        name: t.name,
        status: filled === dates.length ? 'full' : filled > 0 ? 'partial' : 'none',
      };
    }),
    constraints: byTech,
    dates,
    includeFriday: schedule?.includeFriday ?? false,
    scheduleStatus: schedule?.status ?? null,
  });
}
