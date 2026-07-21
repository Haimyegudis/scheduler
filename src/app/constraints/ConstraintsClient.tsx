'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { constraintLabel, absenceLabel } from '@/lib/labels';
import { useT, translateApiError } from '@/lib/i18n';
import { toggleConstraint, stateFromValue, type ToggleButton } from '@/lib/constraintToggle';

const BUTTONS: ToggleButton[] = ['morning', 'evening', 'off'];

export default function ConstraintsClient({ name }: { name: string }) {
  const { t, lang } = useT();
  const TECH_LINKS = [
    { href: '/constraints', label: t('myConstraintsNav') },
    { href: '/schedule', label: t('scheduleNav') },
    { href: '/vacations', label: t('myVacationsNav') },
  ];
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [constraints, setConstraints] = useState<Record<string, string>>({});
  const [absences, setAbsences] = useState<Record<string, string>>({});
  const [includeFriday, setIncludeFriday] = useState(false);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/constraints?weekStart=${ws}`);
      if (res.ok) {
        const data = await res.json();
        setConstraints(data.constraints);
        setAbsences(data.absences ?? {});
        setIncludeFriday(data.includeFriday);
        setPublished(data.published);
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
    load(weekStart);
  }, [weekStart, load]);

  async function toggleDay(date: string, button: ToggleButton) {
    if (published) return;
    const prev = constraints;
    const nextValue = toggleConstraint(constraints[date], button);
    if (nextValue === null) {
      const { [date]: _removed, ...rest } = constraints;
      setConstraints(rest);
    } else {
      setConstraints({ ...constraints, [date]: nextValue });
    }
    try {
      const res =
        nextValue === null
          ? await fetch('/api/constraints', {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ date }),
            })
          : await fetch('/api/constraints', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ date, value: nextValue }),
            });
      if (!res.ok) {
        setConstraints(prev);
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('saveFailed'));
      }
    } catch {
      setConstraints(prev);
      setError(t('networkErrorSaveFailed'));
    }
  }

  const dates = weekDates(weekStart, includeFriday);

  return (
    <div>
      <NavBar name={name} links={TECH_LINKS} />
      <main className="max-w-2xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {published && (
          <p className="bg-yellow-100 text-yellow-800 rounded p-3 mb-4 text-sm">
            {t('weekPublishedNotice')}
          </p>
        )}
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {loading ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            {dates.map(date => (
              <div key={date} className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold w-24">
                  {dayName(date, lang)} <span className="text-gray-400 text-sm">{formatDate(date)}</span>
                </span>
                {absences[date] ? (
                  <span className="px-3 py-1.5 rounded-full text-sm bg-purple-100 text-purple-800">
                    {absenceLabel(lang, absences[date])} {t('enteredByAdmin')}
                  </span>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {BUTTONS.map(opt => {
                      const active = stateFromValue(constraints[date])[opt];
                      return (
                        <button
                          key={opt}
                          disabled={published}
                          aria-pressed={active}
                          onClick={() => toggleDay(date, opt)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white hover:bg-gray-100'
                          } ${published ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {constraintLabel(lang, opt)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-400">{t('autoSavedNote')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
