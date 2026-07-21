'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, dayName, formatDate } from '@/lib/dates';
import { constraintLabel, CONSTRAINT_COLORS, statusLabel, absenceLabel, ABSENCE_COLORS } from '@/lib/labels';
import { useT } from '@/lib/i18n';

const STATUS_COLORS: Record<string, string> = {
  full: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  none: 'bg-rose-100 text-rose-800',
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
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {!data && !error ? (
          <Loading />
        ) : error && !data ? null : data ? (
          <div className="animate-fade-up">
            <div className="mb-5 flex items-center gap-2 text-sm">
              <span className="text-slate-500">{t('scheduleStatusLabel')}</span>
              <span
                className={`badge ${
                  data.scheduleStatus === 'published'
                    ? 'bg-emerald-100 text-emerald-800'
                    : data.scheduleStatus === 'draft'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {data.scheduleStatus === 'published' ? t('statusPublished') : data.scheduleStatus === 'draft' ? t('statusDraft') : t('statusNone')}
              </span>
            </div>
            <h2 className="mb-3 font-bold text-slate-900">{t('technicianConstraintsHeading')}</h2>
            {data.technicians.length === 0 ? (
              <p className="text-slate-500">{t('noTechniciansYet')}</p>
            ) : (
              <div className="surface-card scroll-thin overflow-x-auto">
                <table className="table-shell">
                  <thead>
                    <tr>
                      <th className="th-cell sticky start-0 z-20 text-start">{t('technicianCol')}</th>
                      <th className="th-cell text-center">{t('statusCol')}</th>
                      {data.dates.map(d => (
                        <th key={d} className="th-cell text-center">
                          {dayName(d, lang)}
                          <div className="text-[11px] font-normal tracking-normal text-slate-400 normal-case">{formatDate(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map(tech => (
                      <tr key={tech.id} className="odd:bg-white even:bg-slate-50/40">
                        <td className="td-cell sticky start-0 z-10 bg-slate-50 font-semibold whitespace-nowrap text-slate-800">
                          {tech.name}
                        </td>
                        <td className="td-cell text-center">
                          <span className={`badge ${STATUS_COLORS[tech.status]}`}>{statusLabel(lang, tech.status)}</span>
                        </td>
                        {data.dates.map(date => {
                          const v = data.constraints[String(tech.id)]?.[date];
                          const abs = data.absences[String(tech.id)]?.[date];
                          return (
                            <td key={date} className="td-cell text-center">
                              {abs ? (
                                <span className={`badge ${ABSENCE_COLORS[abs]}`}>{absenceLabel(lang, abs)}</span>
                              ) : v ? (
                                <span className={`badge ${CONSTRAINT_COLORS[v]}`}>{constraintLabel(lang, v)}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
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
          </div>
        ) : null}
      </main>
    </div>
  );
}
