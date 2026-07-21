import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isPushConfigured } from '@/lib/push';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session?.userId) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (!isPushConfigured()) {
    return Response.json({ error: 'שירות ההתראות אינו מוגדר בשרת' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as SubscribeBody;
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  const validEndpoint = endpoint.startsWith('https://') && endpoint.length <= 2048;
  const validP256dh = p256dh.length > 0 && p256dh.length <= 512;
  const validAuth = auth.length > 0 && auth.length <= 512;
  if (!validEndpoint || !validP256dh || !validAuth) {
    return Response.json({ error: 'נתוני מנוי לא תקינים' }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth, technicianId: session.userId },
    create: { endpoint, p256dh, auth, technicianId: session.userId },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session?.userId) return Response.json({ error: 'נדרשת התחברות' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return Response.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, technicianId: session.userId } });
  return Response.json({ ok: true });
}
