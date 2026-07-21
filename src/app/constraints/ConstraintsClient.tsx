'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { CONSTRAINT_LABELS } from '@/lib/labels';

const TECH_LINKS = [
  { href: '/constraints', label: 'האילוצים שלי' },
  { href: '/schedule', label: 'תוכנית משמרות' },
];

const OPTIONS = ['morning', 'evening', 'flex', 'off'];

export default function ConstraintsClient({ name }: { name: string }) {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [constraints, setConstraints] = useState<Record<string, string>>({});
  const [includeFriday, setIncludeFriday] = useState(false);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/constraints?weekStart=${ws}`);
    if (res.ok) {
      const data = await res.json();
      setConstraints(data.constraints);
      setIncludeFriday(data.includeFriday);
      setPublished(data.published);
    } else {
      setError('שגיאה בטעינת נתונים');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  async function setDay(date: string, value: string) {
    if (published) return;
    const prev = constraints;
    setConstraints({ ...constraints, [date]: value });
    const res = await fetch('/api/constraints', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, value }),
    });
    if (!res.ok) {
      setConstraints(prev);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'השמירה נכשלה');
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
            התוכנית לשבוע זה פורסמה — לא ניתן לשנות אילוצים.
          </p>
        )}
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {loading ? (
          <p className="text-center text-gray-500 py-8">טוען...</p>
        ) : (
          <div className="space-y-3">
            {dates.map(date => (
              <div key={date} className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold w-24">
                  {dayName(date)} <span className="text-gray-400 text-sm">{formatDate(date)}</span>
                </span>
                <div className="flex gap-2 flex-wrap">
                  {OPTIONS.map(opt => (
                    <button
                      key={opt}
                      disabled={published}
                      onClick={() => setDay(date, opt)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                        constraints[date] === opt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white hover:bg-gray-100'
                      } ${published ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {CONSTRAINT_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">השינויים נשמרים אוטומטית.</p>
          </div>
        )}
      </main>
    </div>
  );
}
