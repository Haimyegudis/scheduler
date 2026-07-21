import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf } from '@/lib/dates';

interface SaveBody {
  weekStart?: string;
  includeFriday?: boolean;
  assignments?: Array<{
    date: string;
    shift: string;
    stationId: number;
    technicianId: number | null;
    experimenter?: string | null;
    note?: string | null;
  }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const { weekStart, includeFriday = false } = body;
  let { assignments = [] } = body;
  if (!weekStart || !DATE_RE.test(weekStart) || weekStartOf(weekStart) !== weekStart) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }

  const valid = assignments.every(
    a =>
      typeof a?.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(a.date) &&
      (a.shift === 'morning' || a.shift === 'evening') &&
      Number.isInteger(a.stationId) &&
      (a.technicianId === null || Number.isInteger(a.technicianId)) &&
      (a.experimenter === undefined || a.experimenter === null || typeof a.experimenter === 'string') &&
      (a.note === undefined || a.note === null || typeof a.note === 'string')
  );
  if (!valid) return Response.json({ error: 'נתוני שיבוץ לא תקינים' }, { status: 400 });

  const validDates = new Set(weekDates(weekStart, includeFriday));
  assignments = assignments.filter(a => validDates.has(a.date));

  const assignedRows = assignments.filter((a): a is typeof a & { technicianId: number } => a.technicianId !== null);
  if (assignedRows.length > 0) {
    const assignDates = [...new Set(assignedRows.map(a => a.date))].sort();
    const [offRows, absenceRows] = await Promise.all([
      prisma.constraint.findMany({ where: { date: { in: assignDates }, value: 'off' } }),
      prisma.absence.findMany({
        where: {
          startDate: { lte: assignDates[assignDates.length - 1] },
          endDate: { gte: assignDates[0] },
        },
      }),
    ]);
    const offSet = new Set(offRows.map(c => `${c.technicianId}|${c.date}`));
    const blocked = assignedRows.some(
      a =>
        offSet.has(`${a.technicianId}|${a.date}`) ||
        absenceRows.some(
          ab => ab.technicianId === a.technicianId && ab.startDate <= a.date && a.date <= ab.endDate
        )
    );
    if (blocked) {
      return Response.json({ error: 'לא ניתן לשבץ עובד ביום חופש או היעדרות' }, { status: 400 });
    }
  }

  const schedule = await prisma.schedule.upsert({
    where: { weekStart },
    update: { includeFriday },
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
