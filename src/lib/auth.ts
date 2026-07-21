import { SignJWT, jwtVerify } from 'jose';

export interface Session {
  userId?: number;
  role: 'technician' | 'admin';
  name: string;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '');
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      ...(payload.userId !== undefined && { userId: payload.userId as number }),
      role: payload.role as Session['role'],
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `session=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

export async function getSession(req: Request): Promise<Session | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? verifySessionToken(match[1]) : null;
}
