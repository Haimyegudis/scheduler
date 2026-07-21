import { getSession } from '@/lib/auth';
import { getPublicKey, isPushConfigured } from '@/lib/push';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (!isPushConfigured()) {
    return Response.json({ error: 'שירות ההתראות אינו מוגדר בשרת' }, { status: 503 });
  }
  return Response.json({ key: getPublicKey() });
}
