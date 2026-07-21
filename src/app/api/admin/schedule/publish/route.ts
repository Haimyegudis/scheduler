import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { weekStart } = body as { weekStart?: string };
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.findUnique({ where: { weekStart } });
  if (!schedule) return Response.json({ error: 'אין תוכנית לשבוע זה' }, { status: 404 });
  await prisma.schedule.update({ where: { id: schedule.id }, data: { status: 'published' } });
  return Response.json({ ok: true });
}
