import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface SaveBody {
  weekStart?: string;
  includeFriday?: boolean;
  assignments?: Array<{ date: string; shift: string; station: number; technicianId: number }>;
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const { weekStart, includeFriday = false, assignments = [] } = body;
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.upsert({
    where: { weekStart },
    update: { includeFriday },
    create: { weekStart, includeFriday, status: 'draft' },
  });
  await prisma.assignment.deleteMany({ where: { scheduleId: schedule.id } });
  await prisma.assignment.createMany({
    data: assignments.map(a => ({ scheduleId: schedule.id, ...a })),
  });
  return Response.json({ ok: true });
}
