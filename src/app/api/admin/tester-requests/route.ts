import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, formatDate } from '@/lib/dates';
import { sendPushToTechnician } from '@/lib/push';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart || !DATE_RE.test(weekStart)) {
    return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });
  }
  // weekDates with includeFriday=true is the superset of any board configuration.
  const dates = weekDates(weekStart, true);
  const requests = await prisma.testerRequest.findMany({
    where: { date: { in: dates } },
    include: { tester: { select: { id: true, name: true } }, station: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
  });
  requests.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
  return Response.json({ requests });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number; action?: string; stationId?: number };
  const { id, action } = body;
  if (typeof id !== 'number' || (action !== 'approve' && action !== 'reject')) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const request = await prisma.testerRequest.findUnique({ where: { id } });
  if (!request) return Response.json({ error: 'בקשה לא נמצאה' }, { status: 404 });

  if (action === 'approve') {
    if (typeof body.stationId !== 'number') {
      return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    }
    const station = await prisma.station.findUnique({ where: { id: body.stationId } });
    if (!station) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    await prisma.testerRequest.update({
      where: { id },
      data: { status: 'approved', assignedStationId: body.stationId },
    });
    try {
      await sendPushToTechnician(request.testerId, {
        title: 'HP Indigo Scheduler',
        body: `בקשת המכונה שלך ל־${formatDate(request.date)} אושרה (${station.name}) / Your machine request for ${formatDate(request.date)} was approved (${station.name})`,
      });
    } catch {
      // best-effort
    }
  } else {
    await prisma.testerRequest.update({ where: { id }, data: { status: 'rejected', assignedStationId: null } });
    try {
      await sendPushToTechnician(request.testerId, {
        title: 'HP Indigo Scheduler',
        body: `בקשת המכונה שלך ל־${formatDate(request.date)} נדחתה / Your machine request for ${formatDate(request.date)} was declined`,
      });
    } catch {
      // best-effort
    }
  }
  return Response.json({ ok: true });
}
