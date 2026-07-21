import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  const weekStart = new URL(req.url).searchParams.get('weekStart');
  if (!weekStart) return Response.json({ error: 'שבוע לא תקין' }, { status: 400 });

  const schedule = await prisma.schedule.findUnique({
    where: { weekStart },
    include: {
      assignments: {
        select: {
          date: true,
          shift: true,
          stationId: true,
          technicianId: true,
          experimenter: true,
          note: true,
        },
      },
    },
  });
  const visible = schedule && (session.role === 'admin' || schedule.status === 'published');
  const technicians = await prisma.technician.findMany({
    where: { isAdmin: false },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const stations = await prisma.station.findMany({
    where: { active: true },
    select: { id: true, name: true, position: true },
    orderBy: { position: 'asc' },
  });
  return Response.json({
    schedule: visible
      ? { status: schedule.status, includeFriday: schedule.includeFriday, assignments: schedule.assignments }
      : null,
    technicians,
    stations,
  });
}
