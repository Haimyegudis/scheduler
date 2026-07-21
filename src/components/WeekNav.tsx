'use client';

import { addDays, formatDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';

export default function WeekNav({
  weekStart,
  onChange,
}: {
  weekStart: string;
  onChange: (newWeekStart: string) => void;
}) {
  const { t, lang } = useT();
  const prevArrow = lang === 'he' ? '→' : '←';
  const nextArrow = lang === 'he' ? '←' : '→';

  return (
    <div className="mb-4 flex items-center justify-center gap-3 py-1">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        aria-label={t('prevWeek')}
      >
        {prevArrow}
      </button>
      <span className="pill min-w-48 justify-center py-1.5 text-center text-sm font-semibold text-slate-700">
        {t('weekOf')} {formatDate(weekStart)} – {formatDate(addDays(weekStart, 5))}
      </span>
      <button
        onClick={() => onChange(addDays(weekStart, 7))}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        aria-label={t('nextWeek')}
      >
        {nextArrow}
      </button>
    </div>
  );
}
