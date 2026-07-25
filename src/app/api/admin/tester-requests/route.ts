import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekDates, weekStartOf, formatDate } from '@/lib/dates';
import { sendPushToTechnician } from '@/lib/push';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (weekStart) {
    if (!DATE_RE.test(weekStart)) {
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
  // No weekStart: all upcoming requests, for the dedicated admin tab.
  const today = new Date().toISOString().slice(0, 10);
  const requests = await prisma.testerRequest.findMany({
    where: { date: { gte: today } },
    include: { tester: { select: { id: true, name: true } }, station: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
  });
  return Response.json({ requests });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const testerId = body.testerId;
  const date = typeof body.date === 'string' ? body.date : '';
  const shift = typeof body.shift === 'string' ? body.shift : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const swVersion = typeof body.swVersion === 'string' ? body.swVersion.trim() : '';
  const hwNotes = typeof body.hwNotes === 'string' ? body.hwNotes.trim() : '';
  const stationId = body.stationId === undefined || body.stationId === null ? null : body.stationId;
  if (
    !Number.isInteger(testerId) ||
    !DATE_RE.test(date) ||
    (shift !== 'morning' && shift !== 'evening') ||
    !description ||
    description.length > MAX_TEXT ||
    swVersion.length > MAX_TEXT ||
    hwNotes.length > MAX_TEXT ||
    (stationId !== null && !Number.isInteger(stationId))
  ) {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const tester = await prisma.technician.findUnique({ where: { id: testerId as number } });
  if (!tester || tester.role !== 'tester') {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  if (stationId !== null) {
    const station = await prisma.station.findUnique({ where: { id: stationId as number } });
    if (!station) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  await prisma.testerRequest.create({
    data: {
      testerId: testerId as number,
      date,
      shift,
      stationId: stationId as number | null,
      swVersion: swVersion || null,
      hwNotes: hwNotes || null,
      description,
    },
  });
  return Response.json({ ok: true });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: number;
    action?: string;
    stationId?: number;
    place?: boolean;
  };
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
    // place: true — approval from the admin requests tab, where there is no board
    // client to write the cell; the server places the tester on the draft board.
    // The schedule-board panel approves without this flag and writes the cell itself.
    if (body.place === true) {
      const tester = await prisma.technician.findUnique({ where: { id: request.testerId } });
      const testerName = tester?.name ?? '';
      const schedule = await prisma.schedule.upsert({
        where: { weekStart: weekStartOf(request.date) },
        update: {},
        create: { weekStart: weekStartOf(request.date), status: 'draft' },
      });
      const cellWhere = {
        scheduleId_date_shift_stationId: {
          scheduleId: schedule.id,
          date: request.date,
          shift: request.shift,
          stationId: body.stationId,
        },
      };
      const existing = await prisma.assignment.findUnique({ where: cellWhere });
      if (existing) {
        const current = existing.experimenter?.trim();
        await prisma.assignment.update({
          where: cellWhere,
          data: { experimenter: current ? `${current}, ${testerName}` : testerName },
        });
      } else {
        await prisma.assignment.create({
          data: {
            scheduleId: schedule.id,
            date: request.date,
            shift: request.shift,
            stationId: body.stationId,
            technicianId: null,
            experimenter: testerName,
          },
        });
      }
    }
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
