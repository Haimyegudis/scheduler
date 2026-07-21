'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { shiftLabel, constraintLabel, absenceLabel } from '@/lib/labels';
import { useT, translateApiError } from '@/lib/i18n';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

const SHIFTS = ['morning', 'evening'] as const;
const STATIONS = [1, 2, 3, 4];

type CellKey = string; // `${date}|${shift}|${station}`
const key = (date: string, shift: string, station: number): CellKey => `${date}|${shift}|${station}`;

interface Tech { id: number; name: string }

export default function AdminScheduleClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
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
        setMessage(t('loadError'));
      }
    } catch {
      setMessage(t('networkErrorRefresh'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const dates = weekDates(weekStart, includeFriday);

  const assignmentsPayload = useMemo(() => {
    const validDates = new Set(weekDates(weekStart, includeFriday));
    return Object.entries(cells)
      .filter(([, techId]) => techId !== '')
      .map(([k, technicianId]) => {
        const [date, shift, station] = k.split('|');
        return { date, shift, station: Number(station), technicianId: technicianId as number };
      })
      .filter(a => validDates.has(a.date));
  }, [cells, weekStart, includeFriday]);

  const shiftCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of assignmentsPayload) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
    return counts;
  }, [assignmentsPayload]);

  function warningsFor(date: string, shift: string, techId: number | ''): string | null {
    if (techId === '') return null;
    const abs = absences[String(techId)]?.[date];
    if (abs) return `${t('absentPrefix')} ${absenceLabel(lang, abs)}`;
    const c = constraints[String(techId)]?.[date];
    const okByConstraint = c === shift || c === 'flex';
    const timesToday = assignmentsPayload.filter(a => a.date === date && a.technicianId === techId).length;
    if (timesToday > 1) return t('doubleBookedWarning');
    if (!okByConstraint) return c ? `${t('constraintPrefix')} ${constraintLabel(lang, c)}` : t('noConstraintFilled');
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
        setMessage(t('draftSaved'));
        if (status === null) setStatus('draft');
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ? translateApiError(lang, data.error) : t('saveFailed'));
      return false;
    } catch {
      setMessage(t('networkErrorSaveFailed'));
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
      if (Object.keys(cells).length > 0 && !confirm(t('generateConfirm'))) return;
      const res = await fetch('/api/admin/schedule/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ weekStart, includeFriday }),
      });
      if (res.ok) {
        setMessage(t('scheduleGenerated'));
        await load(weekStart);
      } else {
        setMessage(t('generateFailed'));
      }
    } catch {
      setMessage(t('networkErrorGenerateFailed'));
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
        setMessage(t('schedulePublishedMsg'));
      } else {
        setMessage(t('publishFailed'));
      }
    } catch {
      setMessage(t('networkErrorPublishFailed'));
    }
  }

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="max-w-6xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={generate} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                {t('generateScheduleBtn')}
              </button>
              <button onClick={() => saveDraft()} className="bg-white border rounded px-4 py-2 hover:bg-gray-100">
                {t('saveDraftBtn')}
              </button>
              <button onClick={publish} className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700">
                {t('publishBtn')}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeFriday} onChange={e => toggleFriday(e.target.checked)} />
                {t('includeFridayLabel')}
              </label>
              <span className="ms-auto text-sm text-gray-500">
                {t('statusPrefix')} {status === 'published' ? t('statusPublished') : status === 'draft' ? t('statusDraft') : t('statusNone')}
              </span>
            </div>
            {message && <p className="text-sm text-blue-700 mb-3">{message}</p>}
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100">{t('shiftStationHeader')}</th>
                    {dates.map(d => (
                      <th key={d} className="border p-2 bg-gray-100">
                        {dayName(d, lang)}
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
                          {shiftLabel(lang, shift)} · {t('stationLabel')} {station}
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
                                <option value="">{t('emptySelectOption')}</option>
                                {technicians
                                  .filter(
                                    tc =>
                                      (constraints[String(tc.id)]?.[date] !== 'off' &&
                                        !absences[String(tc.id)]?.[date]) ||
                                      tc.id === techId
                                  )
                                  .map(tc => (
                                    <option key={tc.id} value={tc.id}>{tc.name}</option>
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
            <h3 className="font-bold mt-6 mb-2">{t('shiftsPerTechnicianHeading')}</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {technicians.map(tc => (
                <span key={tc.id} className="bg-white border rounded-full px-3 py-1">
                  {tc.name}: {shiftCounts.get(tc.id) ?? 0}
                </span>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
