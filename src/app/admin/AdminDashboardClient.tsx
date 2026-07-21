'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, dayName, formatDate } from '@/lib/dates';
import { CONSTRAINT_LABELS, CONSTRAINT_COLORS, STATUS_LABELS, ABSENCE_LABELS, ABSENCE_COLORS } from '@/lib/labels';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
  { href: '/admin/users', label: 'ניהול משתמשים' },
  { href: '/admin/absences', label: 'היעדרויות' },
  { href: '/admin/reports', label: 'דוחות' },
];

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

export default function AdminDashboardClient() {
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
        setError('שגיאה בטעינת נתונים');
      }
    } catch {
      setError('שגיאת תקשורת — נסה לרענן את הדף');
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-5xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {error && <p role="alert" className="text-red-600 text-sm mb-2">{error}</p>}
        {!data && !error ? (
          <Loading />
        ) : error && !data ? null : data ? (
          <>
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="text-gray-500">סטטוס תוכנית:</span>
              <span className="font-semibold">
                {data.scheduleStatus === 'published' ? 'פורסמה' : data.scheduleStatus === 'draft' ? 'טיוטה' : 'אין תוכנית'}
              </span>
            </div>
            <h2 className="font-bold mb-2">אילוצי טכנאים</h2>
            {data.technicians.length === 0 ? (
              <p className="text-gray-500">אין עדיין טכנאים רשומים.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100 text-start">טכנאי</th>
                      <th className="border p-2 bg-gray-100">סטטוס</th>
                      {data.dates.map(d => (
                        <th key={d} className="border p-2 bg-gray-100">
                          {dayName(d)}
                          <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map(t => (
                      <tr key={t.id}>
                        <td className="border p-2 font-semibold whitespace-nowrap">{t.name}</td>
                        <td className="border p-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[t.status]}`}>
                            {STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        {data.dates.map(date => {
                          const v = data.constraints[String(t.id)]?.[date];
                          const abs = data.absences[String(t.id)]?.[date];
                          return (
                            <td key={date} className="border p-2 text-center">
                              {abs ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${ABSENCE_COLORS[abs]}`}>
                                  {ABSENCE_LABELS[abs]}
                                </span>
                              ) : v ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${CONSTRAINT_COLORS[v]}`}>
                                  {CONSTRAINT_LABELS[v]}
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
