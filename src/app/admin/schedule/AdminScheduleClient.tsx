'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { SHIFT_LABELS, CONSTRAINT_LABELS, ABSENCE_LABELS } from '@/lib/labels';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
  { href: '/admin/users', label: 'ניהול משתמשים' },
  { href: '/admin/absences', label: 'היעדרויות' },
];

const SHIFTS = ['morning', 'evening'] as const;
const STATIONS = [1, 2, 3, 4];

type CellKey = string; // `${date}|${shift}|${station}`
const key = (date: string, shift: string, station: number): CellKey => `${date}|${shift}|${station}`;

interface Tech { id: number; name: string }

export default function AdminScheduleClient() {
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [includeFriday, setIncludeFriday] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<CellKey, number | ''>>({});
  const [technicians, setTechnicians] = useState<Tech[]>([]);
  const [constraints, setConstraints] = useState<Record<string, Record<string, string>>>({});
  const [absences, setAbsences] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setMessage('');
    try {
      const [schedRes, overviewRes] = await Promise.all([
        fetch(`/api/schedule?weekStart=${ws}`),
        fetch(`/api/admin/overview?weekStart=${ws}`),
      ]);
      if (schedRes.ok && overviewRes.ok) {
        const sched = await schedRes.json();
        const overview = await overviewRes.json();
        setTechnicians(sched.technicians);
        setConstraints(overview.constraints);
        setAbsences(overview.absences ?? {});
        setIncludeFriday(sched.schedule?.includeFriday ?? overview.includeFriday ?? false);
        setStatus(sched.schedule?.status ?? null);
        const next: Record<CellKey, number | ''> = {};
        for (const a of sched.schedule?.assignments ?? []) {
          next[key(a.date, a.shift, a.station)] = a.technicianId;
        }
        setCells(next);
      } else {
        setMessage('שגיאה בטעינת נתונים');
      }
    } catch {
      setMessage('שגיאת תקשורת — נסה לרענן את הדף');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const dates = weekDates(weekStart, includeFriday);

  const assignmentsPayload = useMemo(
    () =>
      Object.entries(cells)
        .filter(([, techId]) => techId !== '')
        .map(([k, technicianId]) => {
          const [date, shift, station] = k.split('|');
          return { date, shift, station: Number(station), technicianId: technicianId as number };
        }),
    [cells]
  );

  const shiftCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of assignmentsPayload) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
    return counts;
  }, [assignmentsPayload]);

  function warningsFor(date: string, shift: string, techId: number | ''): string | null {
    if (techId === '') return null;
    const abs = absences[String(techId)]?.[date];
    if (abs) return `נעדר: ${ABSENCE_LABELS[abs]}`;
    const c = constraints[String(techId)]?.[date];
    const okByConstraint = c === shift || c === 'flex';
    const timesToday = assignmentsPayload.filter(a => a.date === date && a.technicianId === techId).length;
    if (timesToday > 1) return 'משובץ פעמיים באותו יום';
    if (!okByConstraint) return c ? `אילוץ: ${CONSTRAINT_LABELS[c]}` : 'לא מילא אילוץ';
    return null;
  }

  async function saveDraft(overrideFriday?: boolean): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          includeFriday: overrideFriday ?? includeFriday,
          assignments: assignmentsPayload,
        }),
      });
      if (res.ok) {
        setMessage('הטיוטה נשמרה');
        if (status === null) setStatus('draft');
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? 'השמירה נכשלה');
      return false;
    } catch {
      setMessage('שגיאת תקשורת — השמירה נכשלה');
      return false;
    }
  }

  async function toggleFriday(value: boolean) {
    setIncludeFriday(value);
    const ok = await saveDraft(value);
    if (ok) {
      await load(weekStart);
    } else {
      setIncludeFriday(!value);
    }
  }

  async function generate() {
    try {
      if (Object.keys(cells).length > 0 && !confirm('יצירת תוכנית תדרוס את השיבוץ הקיים. להמשיך?')) return;
      const res = await fetch('/api/admin/schedule/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ weekStart, includeFriday }),
      });
      if (res.ok) {
        setMessage('נוצרה תוכנית חדשה');
        await load(weekStart);
      } else {
        setMessage('יצירת התוכנית נכשלה');
      }
    } catch {
      setMessage('שגיאת תקשורת — יצירת התוכנית נכשלה');
    }
  }

  async function publish() {
    try {
      if (!(await saveDraft())) return;
      const res = await fetch('/api/admin/schedule/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      if (res.ok) {
        setStatus('published');
        setMessage('התוכנית פורסמה! הטכנאים יכולים לצפות בה.');
      } else {
        setMessage('הפרסום נכשל');
      }
    } catch {
      setMessage('שגיאת תקשורת — הפרסום נכשל');
    }
  }

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-6xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={generate} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                צור תוכנית
              </button>
              <button onClick={() => saveDraft()} className="bg-white border rounded px-4 py-2 hover:bg-gray-100">
                שמור טיוטה
              </button>
              <button onClick={publish} className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700">
                פרסם
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeFriday} onChange={e => toggleFriday(e.target.checked)} />
                כולל שישי
              </label>
              <span className="ms-auto text-sm text-gray-500">
                סטטוס: {status === 'published' ? 'פורסמה' : status === 'draft' ? 'טיוטה' : 'אין תוכנית'}
              </span>
            </div>
            {message && <p className="text-sm text-blue-700 mb-3">{message}</p>}
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100">משמרת / עמדה</th>
                    {dates.map(d => (
                      <th key={d} className="border p-2 bg-gray-100">
                        {dayName(d)}
                        <div className="text-xs text-gray-400 font-normal">{formatDate(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map(shift =>
                    STATIONS.map(station => (
                      <tr key={`${shift}-${station}`}>
                        <td className="border p-2 bg-gray-50 whitespace-nowrap">
                          {SHIFT_LABELS[shift]} · עמדה {station}
                        </td>
                        {dates.map(date => {
                          const k = key(date, shift, station);
                          const techId = cells[k] ?? '';
                          const warning = warningsFor(date, shift, techId);
                          return (
                            <td key={date} className={`border p-1 ${techId === '' ? 'bg-red-50' : ''}`}>
                              <select
                                value={techId}
                                onChange={e =>
                                  setCells(c => ({ ...c, [k]: e.target.value === '' ? '' : Number(e.target.value) }))
                                }
                                className="w-full border-0 bg-transparent text-center"
                              >
                                <option value="">— ריק —</option>
                                {technicians
                                  .filter(
                                    t =>
                                      (constraints[String(t.id)]?.[date] !== 'off' &&
                                        !absences[String(t.id)]?.[date]) ||
                                      t.id === techId
                                  )
                                  .map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                              </select>
                              {warning && <div className="text-xs text-orange-600 text-center">⚠ {warning}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <h3 className="font-bold mt-6 mb-2">משמרות לטכנאי (איזון)</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {technicians.map(t => (
                <span key={t.id} className="bg-white border rounded-full px-3 py-1">
                  {t.name}: {shiftCounts.get(t.id) ?? 0}
                </span>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
