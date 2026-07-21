import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf } from '@/lib/dates';
import { generateAssignments, type ConstraintValue } from '@/lib/scheduler';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { weekStart, includeFriday = false } = body as { weekStart?: string; includeFriday?: boolean };
  if (!weekStart || !DATE_RE.test(weekStart) || weekStartOf(weekStart) !== weekStart) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }

  const dates = weekDates(weekStart, includeFriday);
  const technicians = await prisma.technician.findMany({ where: { isAdmin: false }, select: { id: true } });
  const rows = await prisma.constraint.findMany({ where: { date: { in: dates } } });

  const constraintsByTech = new Map<number, Record<string, ConstraintValue>>();
  for (const r of rows) {
    if (!constraintsByTech.has(r.technicianId)) constraintsByTech.set(r.technicianId, {});
    constraintsByTech.get(r.technicianId)![r.date] = r.value as ConstraintValue;
  }
  const absenceRows = await prisma.absence.findMany({
    where: { startDate: { lte: dates[dates.length - 1] }, endDate: { gte: dates[0] } },
  });
  for (const a of absenceRows) {
    const rec = constraintsByTech.get(a.technicianId);
    if (!rec) continue;
    for (const d of dates) {
      if (a.startDate <= d && d <= a.endDate) delete rec[d];
    }
  }
  const assignments = generateAssignments(
    dates,
    technicians.map(t => ({ technicianId: t.id, constraints: constraintsByTech.get(t.id) ?? {} }))
  );

  const schedule = await prisma.schedule.upsert({
    where: { weekStart },
    update: { includeFriday, status: 'draft' },
    create: { weekStart, includeFriday, status: 'draft' },
  });
  await prisma.$transaction([
    prisma.assignment.deleteMany({ where: { scheduleId: schedule.id } }),
    prisma.assignment.createMany({
      data: assignments.map(a => ({ scheduleId: schedule.id, ...a })),
    }),
  ]);
  return Response.json({ ok: true });
}
