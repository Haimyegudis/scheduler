'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import ScheduleTable, { type AssignmentView } from '@/components/ScheduleTable';
import { getCurrentWeekStart, weekDates } from '@/lib/dates';

const TECH_LINKS = [
  { href: '/constraints', label: 'האילוצים שלי' },
  { href: '/schedule', label: 'תוכנית משמרות' },
];

interface ScheduleData {
  schedule: { status: string; includeFriday: boolean; assignments: AssignmentView[] } | null;
  technicians: Array<{ id: number; name: string }>;
}

export default function ScheduleClient({ name, technicianId }: { name: string; technicianId: number }) {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [data, setData] = useState<ScheduleData | null>(null);

  const load = useCallback(async (ws: string) => {
    setData(null);
    const res = await fetch(`/api/schedule?weekStart=${ws}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="max-w-5xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {!data ? (
          <Loading />
        ) : !data.schedule ? (
          <p className="text-center text-gray-500 py-8">טרם פורסמה תוכנית לשבוע זה.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">המשמרות שלך מודגשות בכחול.</p>
            <ScheduleTable
              dates={weekDates(weekStart, data.schedule.includeFriday)}
              assignments={data.schedule.assignments}
              technicians={data.technicians}
              highlightTechId={technicianId}
            />
          </>
        )}
      </main>
    </div>
  );
}
