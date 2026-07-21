import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import VacationsClient from './VacationsClient';

export default async function VacationsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'technician') redirect('/login');
  return <VacationsClient name={session.name} />;
}
