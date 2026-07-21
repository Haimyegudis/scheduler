import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import AdminAbsencesClient from './AdminAbsencesClient';

export default async function AdminAbsencesPage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') redirect('/login');
  return <AdminAbsencesClient />;
}
