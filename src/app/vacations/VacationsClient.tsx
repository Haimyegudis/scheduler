'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { formatDate } from '@/lib/dates';
import { absenceLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';

interface Summary {
  vacation: number;
  sick: number;
  miluim: number;
  other: number;
  offMarked: number;
  total: number;
}
interface AbsenceRow {
  id: number;
  startDate: string;
  endDate: string;
  type: string;
}
interface VacationsData {
  year: number;
  summary: Summary;
  absences: AbsenceRow[];
}

export default function VacationsClient({ name }: { name: string }) {
  const { t, lang } = useT();
  const TECH_LINKS = [
    { href: '/constraints', label: t('myConstraintsNav') },
    { href: '/schedule', label: t('scheduleNav') },
    { href: '/vacations', label: t('myVacationsNav') },
  ];
  const [data, setData] = useState<VacationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/my-vacations');
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('networkErrorRefresh'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const chips: Array<{ key: keyof Summary; labelKey: 'vacationCol' | 'sickCol' | 'miluimCol' | 'otherCol' | 'offMarkedCol' | 'totalAbsenceCol' }> = [
    { key: 'vacation', labelKey: 'vacationCol' },
    { key: 'sick', labelKey: 'sickCol' },
    { key: 'miluim', labelKey: 'miluimCol' },
    { key: 'other', labelKey: 'otherCol' },
    { key: 'offMarked', labelKey: 'offMarkedCol' },
    { key: 'total', labelKey: 'totalAbsenceCol' },
  ];

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">
          {t('myVacationsNav')}
          {data ? <span className="ms-1 font-normal text-slate-400">— {data.year}</span> : ''}
        </h2>
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : !data ? null : (
          <div className="animate-fade-up space-y-6">
            <div className="flex flex-wrap gap-2 text-sm">
              {chips.map(c => (
                <span
                  key={c.key}
                  className={
                    c.key === 'total'
                      ? 'badge border border-brand-700 bg-linear-to-br from-brand-600 to-brand-700 text-white shadow-sm'
                      : 'pill'
                  }
                >
                  {t(c.labelKey)}: {data.summary[c.key]}
                </span>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-bold text-slate-800">{t('absenceDetailsHeading')}</h3>
              {data.absences.length === 0 ? (
                <p className="text-sm text-slate-500">{t('noAbsencesThisYear')}</p>
              ) : (
                <ul className="surface-card divide-y divide-slate-100 text-sm">
                  {data.absences.map(a => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <span className="font-semibold text-slate-800">{absenceLabel(lang, a.type)}</span>
                      <span className="text-slate-500">
                        {formatDate(a.startDate)} – {formatDate(a.endDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
