'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { dayName, formatDate } from '@/lib/dates';
import { SHIFT_LABELS, ABSENCE_LABELS } from '@/lib/labels';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
  { href: '/admin/users', label: 'ניהול משתמשים' },
  { href: '/admin/absences', label: 'היעדרויות' },
  { href: '/admin/reports', label: 'דוחות' },
];

interface ReportRow {
  date: string;
  shift: string;
  station: number;
  technicianId: number;
  technicianName: string;
}
interface Tech { id: number; name: string }
interface SummaryRow {
  technicianId: number;
  name: string;
  vacation: number;
  sick: number;
  miluim: number;
  other: number;
  offMarked: number;
  total: number;
}
interface AbsenceRow {
  id: number;
  technicianId: number;
  technicianName: string;
  startDate: string;
  endDate: string;
  type: string;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export default function AdminReportsClient() {
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState<'worker' | 'machine' | 'vacations'>('worker');
  const [workerId, setWorkerId] = useState('');
  const [station, setStation] = useState('1');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [absenceRows, setAbsenceRows] = useState<AbsenceRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(d => setTechs((d.users as Array<Tech & { isAdmin: boolean }>).filter(u => !u.isAdmin)))
      .catch(() => setTechs([]));
  }, []);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const { from, to } = monthRange(m);
    try {
      const res = await fetch(`/api/admin/reports?from=${from}&to=${to}`);
      setRows(res.ok ? (await res.json()).assignments : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  useEffect(() => {
    if (mode !== 'vacations') return;
    (async () => {
      setLoading(true);
      try {
        const [sumRes, absRes] = await Promise.all([
          fetch(`/api/admin/vacation-summary?from=${year}-01-01&to=${year}-12-31`),
          fetch('/api/admin/absences'),
        ]);
        setSummary(sumRes.ok ? (await sumRes.json()).summary : []);
        setAbsenceRows(absRes.ok ? (await absRes.json()).absences : []);
      } catch {
        setSummary([]);
        setAbsenceRows([]);
      }
      setLoading(false);
    })();
  }, [mode, year]);

  const filtered =
    mode === 'worker'
      ? rows.filter(r => String(r.technicianId) === workerId)
      : rows.filter(r => String(r.station) === station);

  const morningCount = filtered.filter(r => r.shift === 'morning').length;
  const eveningCount = filtered.filter(r => r.shift === 'evening').length;

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-3">
          {mode === 'vacations' ? (
            <label className="block text-sm">
              שנה
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5"
              >
                {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              חודש
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5"
              />
            </label>
          )}
          <label className="block text-sm">
            תצוגה
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'worker' | 'machine' | 'vacations')}
              className="block mt-1 border rounded px-2 py-1.5"
            >
              <option value="worker">לפי עובד</option>
              <option value="machine">לפי מכונה</option>
              <option value="vacations">סיכום חופשים</option>
            </select>
          </label>
          {mode === 'worker' ? (
            <label className="block text-sm">
              עובד
              <select
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5 min-w-36"
              >
                <option value="">בחר עובד</option>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          ) : mode === 'machine' ? (
            <label className="block text-sm">
              מכונה (עמדה)
              <select
                value={station}
                onChange={e => setStation(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5"
              >
                {[1, 2, 3, 4].map(s => (
                  <option key={s} value={s}>עמדה {s}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {loading ? (
          <Loading />
        ) : mode === 'worker' && !workerId ? (
          <p className="text-center text-gray-500 py-8">בחר עובד להצגת הדוח.</p>
        ) : mode === 'vacations' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100 text-start">עובד</th>
                    <th className="border p-2 bg-gray-100">חופשה</th>
                    <th className="border p-2 bg-gray-100">מחלה</th>
                    <th className="border p-2 bg-gray-100">מילואים</th>
                    <th className="border p-2 bg-gray-100">אחר</th>
                    <th className="border p-2 bg-gray-100">סימן חופש</th>
                    <th className="border p-2 bg-gray-100">סה"כ היעדרות</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.technicianId}>
                      <td className="border p-2 font-semibold">{s.name}</td>
                      <td className="border p-2 text-center">{s.vacation}</td>
                      <td className="border p-2 text-center">{s.sick}</td>
                      <td className="border p-2 text-center">{s.miluim}</td>
                      <td className="border p-2 text-center">{s.other}</td>
                      <td className="border p-2 text-center">{s.offMarked}</td>
                      <td className="border p-2 text-center font-bold">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-bold mt-4 mb-2">פירוט היעדרויות ({year})</h3>
            {absenceRows.filter(a => a.startDate.startsWith(year) || a.endDate.startsWith(year)).length === 0 ? (
              <p className="text-gray-500 text-sm">אין היעדרויות בשנה זו.</p>
            ) : (
              <ul className="bg-white rounded-lg shadow-sm divide-y text-sm">
                {absenceRows
                  .filter(a => a.startDate.startsWith(year) || a.endDate.startsWith(year))
                  .map(a => (
                    <li key={a.id} className="px-3 py-2 flex flex-wrap gap-2">
                      <span className="font-semibold">{a.technicianName}</span>
                      <span>{ABSENCE_LABELS[a.type]}</span>
                      <span className="text-gray-500">
                        {formatDate(a.startDate)} – {formatDate(a.endDate)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2 text-sm">
              <span className="bg-white border rounded-full px-3 py-1">סה"כ: {filtered.length}</span>
              <span className="bg-white border rounded-full px-3 py-1">בוקר: {morningCount}</span>
              <span className="bg-white border rounded-full px-3 py-1">ערב: {eveningCount}</span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-gray-500 text-sm">אין משמרות בתקופה זו (רק תוכניות שפורסמו נכללות).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100">תאריך</th>
                      <th className="border p-2 bg-gray-100">יום</th>
                      <th className="border p-2 bg-gray-100">משמרת</th>
                      <th className="border p-2 bg-gray-100">
                        {mode === 'worker' ? 'מכונה (עמדה)' : 'עובד'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i}>
                        <td className="border p-2 text-center">{formatDate(r.date)}</td>
                        <td className="border p-2 text-center">{dayName(r.date)}</td>
                        <td className="border p-2 text-center">{SHIFT_LABELS[r.shift]}</td>
                        <td className="border p-2 text-center">
                          {mode === 'worker' ? `עמדה ${r.station}` : r.technicianName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
