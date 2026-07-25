import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { weekStartOf } from '@/lib/dates';
import { sendPushToAdmins } from '@/lib/push';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const [requests, stations] = await Promise.all([
    prisma.testerRequest.findMany({
      where: { testerId: session.userId },
      include: { station: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.station.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { position: 'asc' } }),
  ]);
  return Response.json({ requests, stations });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = typeof body.date === 'string' ? body.date : '';
  const shift = typeof body.shift === 'string' ? body.shift : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const swVersion = typeof body.swVersion === 'string' ? body.swVersion.trim() : '';
  const hwNotes = typeof body.hwNotes === 'string' ? body.hwNotes.trim() : '';
  const stationId = body.stationId === undefined || body.stationId === null ? null : body.stationId;
  if (
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
  if (stationId !== null) {
    const station = await prisma.station.findUnique({ where: { id: stationId as number } });
    if (!station) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  const schedule = await prisma.schedule.findUnique({ where: { weekStart: weekStartOf(date) } });
  if (schedule?.status === 'published') {
    return Response.json({ error: 'התוכנית לשבוע זה כבר פורסמה — פנה למנהל' }, { status: 409 });
  }
  await prisma.testerRequest.create({
    data: {
      testerId: session.userId!,
      date,
      shift,
      stationId: stationId as number | null,
      swVersion: swVersion || null,
      hwNotes: hwNotes || null,
      description,
    },
  });
  try {
    await sendPushToAdmins({
      title: 'HP Indigo Scheduler',
      body: `בקשת מכונה חדשה מ־${session.name} / New machine request from ${session.name}`,
    });
  } catch {
    // sendPushToAdmins already swallows its own errors; defense-in-depth.
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (session.role !== 'tester') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const request = await prisma.testerRequest.findUnique({ where: { id: body.id } });
  if (!request || request.testerId !== session.userId) {
    return Response.json({ error: 'בקשה לא נמצאה' }, { status: 404 });
  }
  if (request.status !== 'pending') {
    return Response.json({ error: 'לא ניתן לבטל בקשה שכבר טופלה' }, { status: 400 });
  }
  await prisma.testerRequest.delete({ where: { id: body.id } });
  return Response.json({ ok: true });
}
