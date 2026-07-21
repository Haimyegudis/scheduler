import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf } from '@/lib/dates';

const VALID_VALUES = ['morning', 'evening', 'flex', 'off'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart || !DATE_RE.test(weekStart)) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  const dates = weekDates(weekStart, schedule?.includeFriday ?? false);
  const rows = await prisma.constraint.findMany({
    where: { technicianId: session.userId, date: { in: dates } },
  });
  return Response.json({
    constraints: Object.fromEntries(rows.map(r => [r.date, r.value])),
    includeFriday: schedule?.includeFriday ?? false,
    published: schedule?.status === 'published',
  });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { date, value } = body as { date?: string; value?: string };
  if (!date || !DATE_RE.test(date) || !value || !VALID_VALUES.includes(value)) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: weekStartOf(date) } });
  if (schedule?.status === 'published') {
    return Response.json({ error: 'התוכנית לשבוע זה כבר פורסמה — לא ניתן לשנות אילוצים' }, { status: 409 });
  }
  await prisma.constraint.upsert({
    where: { technicianId_date: { technicianId: session.userId!, date } },
    update: { value },
    create: { technicianId: session.userId!, date, value },
  });
  return Response.json({ ok: true });
}
