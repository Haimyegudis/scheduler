import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import ScheduleClient from './ScheduleClient';

export default async function SchedulePage() {
  const token = (await cookies()).get('session')?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || (session.role !== 'technician' && session.role !== 'tester')) redirect('/login');
  return <ScheduleClient name={session.name} technicianId={session.userId!} role={session.role} />;
}
