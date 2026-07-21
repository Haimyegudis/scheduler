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
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {published && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t('weekPublishedNotice')}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}
        {loading ? (
          <Loading />
        ) : (
          <div className="animate-fade-up space-y-3">
            {dates.map(date => (
              <div
                key={date}
                className="surface-card flex flex-wrap items-center gap-3 p-4 transition hover:border-brand-200"
              >
                <span className="w-24 font-semibold text-slate-800">
                  {dayName(date, lang)}
                  <span className="block text-xs font-normal text-slate-400">{formatDate(date)}</span>
                </span>
                {absences[date] ? (
                  <span className="badge border border-purple-200 bg-purple-100 text-purple-800">
                    {absenceLabel(lang, absences[date])} {t('enteredByAdmin')}
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {BUTTONS.map(opt => {
                      const active = stateFromValue(constraints[date])[opt];
                      return (
                        <button
                          key={opt}
                          disabled={published}
                          aria-pressed={active}
                          onClick={() => toggleDay(date, opt)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
                            active
                              ? 'border-brand-700 bg-linear-to-br from-brand-600 to-brand-700 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'
                          } ${published ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          {constraintLabel(lang, opt)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <p className="px-1 text-xs text-slate-400">{t('autoSavedNote')}</p>
          </div>
        )}
      </main>
    </div>
  );
}
