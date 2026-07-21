import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, sessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const tech = email ? await prisma.technician.findUnique({ where: { email } }) : null;
  if (!tech || !password || !(await bcrypt.compare(password, tech.passwordHash))) {
    return Response.json({ error: 'מייל או סיסמה שגויים' }, { status: 401 });
  }
  const role = tech.isAdmin ? 'admin' : 'technician';
  const token = await createSessionToken({ userId: tech.id, role, name: tech.name });
  return Response.json({ ok: true, role }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}
