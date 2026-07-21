'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import ScheduleTable, { type AssignmentView, type StationView } from '@/components/ScheduleTable';
import { getCurrentWeekStart, weekDates } from '@/lib/dates';
import { useT } from '@/lib/i18n';

interface ScheduleData {
  schedule: { status: string; includeFriday: boolean; assignments: AssignmentView[] } | null;
  technicians: Array<{ id: number; name: string }>;
  stations: StationView[];
}

export default function ScheduleClient({ name, technicianId }: { name: string; technicianId: number }) {
  const { t } = useT();
  const TECH_LINKS = [
    { href: '/constraints', label: t('myConstraintsNav') },
    { href: '/schedule', label: t('scheduleNav') },
    { href: '/vacations', label: t('myVacationsNav') },
  ];
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (ws: string) => {
    setData(null);
    setError('');
    try {
      const res = await fetch(`/api/schedule?weekStart=${ws}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('networkErrorRefresh'));
    }
  }, [t]);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {!data && !error ? (
          <Loading />
        ) : error && !data ? null : !data ? null : !data.schedule ? (
          <p className="py-16 text-center text-slate-500">{t('noScheduleYet')}</p>
        ) : (
          <div className="animate-fade-up">
            <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-100 ring-1 ring-brand-200" />
              {t('yourShiftsHighlighted')}
            </p>
            <ScheduleTable
              dates={weekDates(weekStart, data.schedule.includeFriday)}
              assignments={data.schedule.assignments}
              technicians={data.technicians}
              stations={data.stations}
              highlightTechId={technicianId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
