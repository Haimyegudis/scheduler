import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import RequestsClient from './RequestsClient';

export default async function RequestsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) redirect('/login');
  if (session.role !== 'tester') redirect(session.role === 'admin' ? '/admin' : '/constraints');
  return <RequestsClient name={session.name} />;
}
