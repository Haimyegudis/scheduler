import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';

export default async function Home() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect('/login');
  redirect(session.role === 'admin' ? '/admin' : '/constraints');
}
