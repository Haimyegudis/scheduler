'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, dayName, formatDate } from '@/lib/dates';
import { constraintLabel, CONSTRAINT_COLORS, statusLabel, absenceLabel, ABSENCE_COLORS } from '@/lib/labels';
import { useT } from '@/lib/i18n';

const STATUS_COLORS: Record<string, string> = {
  full: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  none: 'bg-red-100 text-red-800',
};

interface Overview {
  technicians: Array<{ id: number; name: string; status: string }>;
  constraints: Record<string, Record<string, string>>;
  absences: Record<string, Record<string, string>>;
  dates: string[];
  scheduleStatus: string | null;
}

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

export default function AdminDashboardClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (ws: string) => {
    setData(null);
    setError('');
    try {
      const res = await fetch(`/api/admin/overview?weekStart=${ws}`);
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
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="max-w-5xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {error && <p role="alert" className="text-red-600 text-sm mb-2">{error}</p>}
        {!data && !error ? (
          <Loading />
        ) : error && !data ? null : data ? (
          <>
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="text-gray-500">{t('scheduleStatusLabel')}</span>
              <span className="font-semibold">
                {data.scheduleStatus === 'published' ? t('statusPublished') : data.scheduleStatus === 'draft' ? t('statusDraft') : t('statusNone')}
              </span>
            </div>
            <h2 className="font-bold mb-2">{t('technicianConstraintsHeading')}</h2>
            {data.technicians.length === 0 ? (
              <p className="text-gray-500">{t('noTechniciansYet')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100 text-start">{t('technicianCol')}</th>
                      <th className="border p-2 bg-gray-100">{t('statusCol')}</th>
                      {data.dates.map(d => (
                        <th key={d} className="border p-2 bg-gray-100">
                          {dayName(d, lang)}
                          <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map(tech => (
                      <tr key={tech.id}>
                        <td className="border p-2 font-semibold whitespace-nowrap">{tech.name}</td>
                        <td className="border p-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[tech.status]}`}>
                            {statusLabel(lang, tech.status)}
                          </span>
                        </td>
                        {data.dates.map(date => {
                          const v = data.constraints[String(tech.id)]?.[date];
                          const abs = data.absences[String(tech.id)]?.[date];
                          return (
                            <td key={date} className="border p-2 text-center">
                              {abs ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${ABSENCE_COLORS[abs]}`}>
                                  {absenceLabel(lang, abs)}
                                </span>
                              ) : v ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${CONSTRAINT_COLORS[v]}`}>
                                  {constraintLabel(lang, v)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
