import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import ConstraintsClient from './ConstraintsClient';

export default async function ConstraintsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'technician') redirect('/login');
  return <ConstraintsClient name={session.name} />;
}
