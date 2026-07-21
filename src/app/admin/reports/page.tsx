import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminReportsClient from './AdminReportsClient';

export default async function AdminReportsPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/login');
  return <AdminReportsClient />;
}
