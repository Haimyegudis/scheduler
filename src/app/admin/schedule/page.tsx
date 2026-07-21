import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminScheduleClient from './AdminScheduleClient';

export default async function AdminSchedulePage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/login');
  return <AdminScheduleClient />;
}
