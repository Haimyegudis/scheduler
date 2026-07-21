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
      <main className="max-w-2xl mx-auto p-4">
        <h2 className="font-bold text-lg mb-3">
          {t('myVacationsNav')}
          {data ? ` — ${data.year}` : ''}
        </h2>
        {error && <p role="alert" className="text-red-600 text-sm mb-2">{error}</p>}
        {loading ? (
          <Loading />
        ) : !data ? null : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              {chips.map(c => (
                <span
                  key={c.key}
                  className={`border rounded-full px-3 py-1 ${
                    c.key === 'total' ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-white'
                  }`}
                >
                  {t(c.labelKey)}: {data.summary[c.key]}
                </span>
              ))}
            </div>
            <div>
              <h3 className="font-bold mb-2">{t('absenceDetailsHeading')}</h3>
              {data.absences.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('noAbsencesThisYear')}</p>
              ) : (
                <ul className="bg-white rounded-lg shadow-sm divide-y text-sm">
                  {data.absences.map(a => (
                    <li key={a.id} className="px-3 py-2 flex flex-wrap gap-2">
                      <span className="font-semibold">{absenceLabel(lang, a.type)}</span>
                      <span className="text-gray-500">
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
