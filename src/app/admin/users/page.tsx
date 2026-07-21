import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminUsersClient from './AdminUsersClient';

export default async function AdminUsersPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/login');
  return <AdminUsersClient myUserId={session.userId!} />;
}
