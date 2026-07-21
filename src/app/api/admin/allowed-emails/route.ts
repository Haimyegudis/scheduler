import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const emails = await prisma.allowedEmail.findMany({
    select: { id: true, email: true },
    orderBy: { email: 'asc' },
  });
  return Response.json({ emails });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
  }
  const existing = await prisma.allowedEmail.findUnique({ where: { email } });
  if (existing) return Response.json({ error: 'המייל כבר ברשימה' }, { status: 409 });
  await prisma.allowedEmail.create({ data: { email } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (session?.role !== 'admin') return Response.json({ error: 'אין הרשאה' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) return Response.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
  await prisma.allowedEmail.deleteMany({ where: { email } });
  return Response.json({ ok: true });
}
