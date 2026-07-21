import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const stations = await prisma.station.findMany({ orderBy: { position: 'asc' } });
  return Response.json({ stations });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'נא להזין שם עמדה' }, { status: 400 });
  const last = await prisma.station.findFirst({ orderBy: { position: 'desc' } });
  const station = await prisma.station.create({
    data: { name, position: (last?.position ?? 0) + 1 },
  });
  return Response.json({ station });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: number;
    name?: string;
    active?: boolean;
    position?: number;
  };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const existing = await prisma.station.findUnique({ where: { id: body.id } });
  if (!existing) return Response.json({ error: 'עמדה לא נמצאה' }, { status: 404 });

  const data: { name?: string; active?: boolean; position?: number } = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) return Response.json({ error: 'נא להזין שם עמדה' }, { status: 400 });
    data.name = trimmed;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    data.active = body.active;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position)) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    data.position = body.position;
  }

  await prisma.station.update({ where: { id: body.id }, data });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (typeof body.id !== 'number') return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  const existing = await prisma.station.findUnique({ where: { id: body.id } });
  if (!existing) return Response.json({ error: 'עמדה לא נמצאה' }, { status: 404 });
  const referenced = await prisma.assignment.findFirst({ where: { stationId: body.id } });
  if (referenced) {
    return Response.json({ error: 'לא ניתן למחוק עמדה שמשובצת בתוכנית — ניתן להשבית אותה' }, { status: 409 });
  }
  await prisma.station.delete({ where: { id: body.id } });
  return Response.json({ ok: true });
}
