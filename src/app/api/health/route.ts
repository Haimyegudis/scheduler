import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {};

  const dbUrl = process.env.DATABASE_URL;
  checks.DATABASE_URL = dbUrl
    ? dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')
      ? 'set (postgresql)'
      : 'set (WRONG PROTOCOL — must start with postgresql://)'
    : 'MISSING';
  checks.JWT_SECRET = process.env.JWT_SECRET ? 'set' : 'MISSING';

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.dbConnection = 'ok';
  } catch (e) {
    checks.dbConnection = `FAIL: ${(e as Error).message.slice(0, 300)}`;
  }

  try {
    const count = await prisma.technician.count();
    checks.technicianTable = `ok (rows=${count})`;
  } catch (e) {
    checks.technicianTable = `FAIL: ${(e as Error).message.slice(0, 300)}`;
  }

  try {
    const count = await prisma.station.count();
    checks.stationTable = `ok (rows=${count})`;
  } catch (e) {
    checks.stationTable = `FAIL: ${(e as Error).message.slice(0, 300)}`;
  }

  try {
    const count = await prisma.pushSubscription.count();
    checks.pushSubscriptionTable = `ok (rows=${count})`;
  } catch (e) {
    checks.pushSubscriptionTable = `FAIL: ${(e as Error).message.slice(0, 300)}`;
  }

  try {
    await createSessionToken({ userId: 0, role: 'technician', name: 'health' });
    checks.jwtSign = 'ok';
  } catch (e) {
    checks.jwtSign = `FAIL: ${(e as Error).message.slice(0, 120)}`;
  }

  return Response.json(checks);
}
