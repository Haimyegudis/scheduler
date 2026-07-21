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
    <div className="flex items-center justify-center gap-4 py-3">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        className="px-3 py-1 rounded border bg-white hover:bg-gray-100"
        aria-label={t('prevWeek')}
      >
        {prevArrow}
      </button>
      <span className="font-semibold min-w-40 text-center">
        {t('weekOf')} {formatDate(weekStart)} – {formatDate(addDays(weekStart, 5))}
      </span>
      <button
        onClick={() => onChange(addDays(weekStart, 7))}
        className="px-3 py-1 rounded border bg-white hover:bg-gray-100"
        aria-label={t('nextWeek')}
      >
        {nextArrow}
      </button>
    </div>
  );
}
