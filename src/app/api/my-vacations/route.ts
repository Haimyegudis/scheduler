import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { emptyAbsenceCounts, addAbsenceToCounts, totalOf } from '@/lib/vacationDays';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session || session.role !== 'technician') {
    return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }

  const year = new Date().getUTCFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const absences = await prisma.absence.findMany({
    where: { technicianId: session.userId!, startDate: { lte: to }, endDate: { gte: from } },
    orderBy: { startDate: 'asc' },
  });
  const offMarked = await prisma.constraint.count({
    where: { technicianId: session.userId!, value: 'off', date: { gte: from, lte: to } },
  });

  const counts = emptyAbsenceCounts();
  for (const a of absences) {
    addAbsenceToCounts(counts, a, from, to);
  }

  return Response.json({
    year,
    summary: { ...counts, offMarked, total: totalOf(counts) },
    absences: absences.map(a => ({ id: a.id, startDate: a.startDate, endDate: a.endDate, type: a.type })),
  });
}
