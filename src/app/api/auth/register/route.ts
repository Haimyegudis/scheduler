import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, sessionCookie } from '@/lib/auth';
import { ADMIN_EMAIL } from '@/lib/config';
import { sendPushToAdmins } from '@/lib/push';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || !email || !password || password.length < 8) {
    return Response.json({ error: 'נא למלא שם, מייל וסיסמה באורך 8 תווים לפחות' }, { status: 400 });
  }
  const isBootstrapAdmin = email === ADMIN_EMAIL.toLowerCase();
  if (!isBootstrapAdmin) {
    const allowed = await prisma.allowedEmail.findUnique({ where: { email } });
    if (!allowed) {
      return Response.json({ error: 'המייל אינו מורשה להרשמה. פנה למנהל.' }, { status: 403 });
    }
  }
  const existing = await prisma.technician.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: 'המייל כבר רשום במערכת' }, { status: 409 });
  }
  let tech;
  try {
    tech = await prisma.technician.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10), isAdmin: isBootstrapAdmin },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return Response.json({ error: 'המייל כבר רשום במערכת' }, { status: 409 });
    }
    throw e;
  }
  const role = tech.isAdmin ? 'admin' : 'technician';
  const token = await createSessionToken({ userId: tech.id, role, name: tech.name });

  // Notify admins that a new user has registered. Best-effort — registration
  // must succeed regardless of push delivery outcome — and excludes the new
  // account itself in case it's the bootstrap admin registering for the first time.
  try {
    await sendPushToAdmins(
      {
        title: 'HP Indigo Scheduler',
        body: `נרשם משתמש חדש: ${name} / New user registered: ${name}`,
      },
      tech.id
    );
  } catch {
    // sendPushToAdmins already swallows its own errors; this is defense-in-depth.
  }

  return Response.json({ ok: true, role }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}
