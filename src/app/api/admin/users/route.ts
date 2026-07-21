import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const users = await prisma.technician.findMany({
    select: { id: true, name: true, email: true, isAdmin: true },
    orderBy: { name: 'asc' },
  });
  return Response.json({ users });
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { userId?: number; isAdmin?: boolean };
  const { userId, isAdmin } = body;
  if (typeof userId !== 'number' || typeof isAdmin !== 'boolean') {
    return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }
  if (userId === session.userId) {
    return Response.json({ error: 'לא ניתן לשנות את ההרשאה של עצמך' }, { status: 400 });
  }
  const user = await prisma.technician.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  await prisma.technician.update({ where: { id: userId }, data: { isAdmin } });
  return Response.json({ ok: true });
}
