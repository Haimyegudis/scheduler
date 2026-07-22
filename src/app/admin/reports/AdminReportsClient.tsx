'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { addDays, dayName, formatDate, getCurrentWeekStart } from '@/lib/dates';
import { shiftLabel, absenceLabel } from '@/lib/labels';
import { useT, type DictKey } from '@/lib/i18n';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

interface ReportRow {
  date: string;
  shift: string;
  stationId: number;
  stationName: string;
  technicianId: number | null;
  technicianName: string | null;
}
interface Tech { id: number; name: string }
interface StationOpt { id: number; name: string }
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

// Chart palette — validated for categorical use (light surface):
// CVD adjacent-pair separation, chroma floor, and contrast all pass with the
// dataviz skill's `validate_palette.js` script. See conversation notes; both
// pairs get direct value labels/legends since neither clears the 3:1 solid-fill
// contrast check on its own (a WARN in that validator that requires visible
// labels rather than color alone — which every chart below already has).
const MORNING_COLOR = '#f59e0b'; // amber-500
const EVENING_COLOR = '#6366f1'; // indigo-500
const ABSENCE_TYPE_COLORS = {
  vacation: '#a855f7', // purple-500
  sick: '#f43f5e', // rose-500
  miluim: '#14b8a6', // teal-500
  other: '#d97706', // amber-600 (kept saturated so it still reads as a hue, not gray)
} as const;

// Path for a bar with only its outward (top, for vertical bars) end rounded,
// anchored flush to the baseline — per the dataviz mark spec, never rounded
// on all four corners.
function topRoundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// Simple two-bar chart: total Morning vs. Evening shift counts for the
// currently selected worker/press and period.
function TotalsBarChart({
  morning,
  evening,
  morningLabel,
  eveningLabel,
}: {
  morning: number;
  evening: number;
  morningLabel: string;
  eveningLabel: string;
}) {
  const max = Math.max(morning, evening, 1);
  const chartH = 88;
  const barW = 56;
  const gap = 40;
  const svgW = barW * 2 + gap * 3;
  const bars = [
    { label: morningLabel, value: morning, color: MORNING_COLOR, x: gap },
    { label: eveningLabel, value: evening, color: EVENING_COLOR, x: gap * 2 + barW },
  ];
  return (
    <div dir="ltr" className="inline-block">
      <svg width={svgW} height={chartH + 36} role="img" aria-label={`${morningLabel}: ${morning}, ${eveningLabel}: ${evening}`}>
        <line x1={0} y1={chartH + 0.5} x2={svgW} y2={chartH + 0.5} stroke="#e2e8f0" strokeWidth={1} />
        {bars.map(b => {
          const h = Math.round((b.value / max) * chartH);
          return (
            <g key={b.label}>
              <path d={topRoundedRectPath(b.x, chartH - h, barW, h, 4)} fill={b.color}>
                <title>{`${b.label}: ${b.value}`}</title>
              </path>
              <text x={b.x + barW / 2} y={chartH - h - 8} textAnchor="middle" className="fill-slate-700 text-xs font-semibold">
                {b.value}
              </text>
              <text x={b.x + barW / 2} y={chartH + 18} textAnchor="middle" className="fill-slate-500 text-[11px]">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Grouped bar chart: Morning vs. Evening counts per day across a short (weekly)
// period. Intentionally only offered at weekly granularity — a full month of
// day-groups would be too dense to read as bars.
function DailyShiftsChart({
  dates,
  countsByDate,
  lang,
  morningLabel,
  eveningLabel,
}: {
  dates: string[];
  countsByDate: Map<string, { morning: number; evening: number }>;
  lang: 'he' | 'en';
  morningLabel: string;
  eveningLabel: string;
}) {
  const barW = 16;
  const pairGap = 3;
  const groupGap = 26;
  const chartH = 90;
  const groupW = barW * 2 + pairGap;
  const svgW = dates.length * groupW + (dates.length + 1) * groupGap;
  const counts = dates.map(d => countsByDate.get(d) ?? { morning: 0, evening: 0 });
  const max = Math.max(...counts.flatMap(c => [c.morning, c.evening]), 1);

  return (
    <div dir="ltr" className="scroll-thin overflow-x-auto">
      <svg width={svgW} height={chartH + 34} role="img" aria-label={`${morningLabel} vs ${eveningLabel} by day`}>
        <line x1={0} y1={chartH + 0.5} x2={svgW} y2={chartH + 0.5} stroke="#e2e8f0" strokeWidth={1} />
        {dates.map((d, i) => {
          const gx = groupGap + i * (groupW + groupGap);
          const c = counts[i];
          const mh = Math.round((c.morning / max) * chartH);
          const eh = Math.round((c.evening / max) * chartH);
          return (
            <g key={d}>
              <path d={topRoundedRectPath(gx, chartH - mh, barW, mh, 3)} fill={MORNING_COLOR}>
                <title>{`${dayName(d, lang)} ${formatDate(d)} — ${morningLabel}: ${c.morning}`}</title>
              </path>
              <path d={topRoundedRectPath(gx + barW + pairGap, chartH - eh, barW, eh, 3)} fill={EVENING_COLOR}>
                <title>{`${dayName(d, lang)} ${formatDate(d)} — ${eveningLabel}: ${c.evening}`}</title>
              </path>
              <text x={gx + barW + pairGap / 2} y={chartH + 18} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {dayName(d, lang).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Horizontal stacked bar per employee: vacation/sick/miluim/other, scaled to
// the busiest employee's total so bar lengths stay comparable in absolute terms.
function AbsenceBreakdownChart({ data, t }: { data: SummaryRow[]; t: (k: DictKey) => string }) {
  const TYPES: Array<{ key: 'vacation' | 'sick' | 'miluim' | 'other'; labelKey: DictKey }> = [
    { key: 'vacation', labelKey: 'vacationCol' },
    { key: 'sick', labelKey: 'sickCol' },
    { key: 'miluim', labelKey: 'miluimCol' },
    { key: 'other', labelKey: 'otherCol' },
  ];
  const nameColW = 120;
  const trackW = 280;
  const barH = 20;
  const rowGap = 10;
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const svgH = data.length * (barH + rowGap);

  if (data.length === 0) return null;

  return (
    <div dir="ltr" className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {TYPES.map(ty => (
          <span key={ty.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ABSENCE_TYPE_COLORS[ty.key] }} />
            {t(ty.labelKey)}
          </span>
        ))}
      </div>
      <div className="scroll-thin overflow-x-auto">
        <svg width={nameColW + trackW + 40} height={svgH} role="img" aria-label={t('absenceBreakdownHeading')}>
          {data.map((row, i) => {
            const y = i * (barH + rowGap);
            const scale = trackW / maxTotal;
            let x = nameColW;
            return (
              <g key={row.technicianId}>
                <text x={0} y={y + barH / 2 + 4} className="fill-slate-700 text-xs font-medium">
                  {row.name}
                </text>
                {TYPES.map(ty => {
                  const value = row[ty.key];
                  if (value <= 0) return null;
                  const w = Math.max(value * scale, 3);
                  const seg = (
                    <rect
                      key={ty.key}
                      x={x + 1}
                      y={y}
                      width={Math.max(w - 2, 1)}
                      height={barH}
                      rx={3}
                      fill={ABSENCE_TYPE_COLORS[ty.key]}
                    >
                      <title>{`${row.name} — ${t(ty.labelKey)}: ${value}`}</title>
                    </rect>
                  );
                  x += w;
                  return seg;
                })}
                <text x={x + 6} y={y + barH / 2 + 4} className="fill-slate-500 text-[11px] font-semibold">
                  {row.total}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function AdminReportsClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [month, setMonth] = useState(currentMonth());
  const [granularity, setGranularity] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [mode, setMode] = useState<'worker' | 'machine' | 'vacations'>('worker');
  const [workerId, setWorkerId] = useState('');
  const [station, setStation] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [stations, setStations] = useState<StationOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [absenceRows, setAbsenceRows] = useState<AbsenceRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(d => setTechs((d.users as Array<Tech & { isAdmin: boolean }>).filter(u => !u.isAdmin)))
      .catch(() => setTechs([]));
    fetch('/api/admin/stations')
      .then(r => (r.ok ? r.json() : { stations: [] }))
      .then(d => {
        const opts = (d.stations as Array<StationOpt & { position: number }>)
          .slice()
          .sort((a, b) => a.position - b.position);
        setStations(opts);
        setStation(prev => prev || (opts[0] ? String(opts[0].id) : ''));
      })
      .catch(() => setStations([]));
  }, []);

  const load = useCallback(async (m: string, gran: 'month' | 'week', ws: string) => {
    setLoading(true);
    const { from, to } = gran === 'week' ? { from: ws, to: addDays(ws, 6) } : monthRange(m);
    try {
      const res = await fetch(`/api/admin/reports?from=${from}&to=${to}`);
      setRows(res.ok ? (await res.json()).assignments : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(month, granularity, weekStart);
  }, [month, granularity, weekStart, load]);

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
      : rows.filter(r => String(r.stationId) === station);

  const morningCount = filtered.filter(r => r.shift === 'morning').length;
  const eveningCount = filtered.filter(r => r.shift === 'evening').length;

  const periodDates = granularity === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const countsByDate = new Map<string, { morning: number; evening: number }>();
  for (const d of periodDates) {
    countsByDate.set(d, {
      morning: filtered.filter(r => r.date === d && r.shift === 'morning').length,
      evening: filtered.filter(r => r.date === d && r.shift === 'evening').length,
    });
  }

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {mode !== 'vacations' && granularity === 'week' && (
          <div className="flex items-center justify-center gap-3 py-1">
            <button
              type="button"
              onClick={() => setWeekStart(ws => addDays(ws, -7))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              aria-label={t('prevWeek')}
            >
              {lang === 'he' ? '→' : '←'}
            </button>
            <span className="pill min-w-48 justify-center py-1.5 text-center text-sm font-semibold text-slate-700">
              {t('weekOf')} {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
            </span>
            <button
              type="button"
              onClick={() => setWeekStart(ws => addDays(ws, 7))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              aria-label={t('nextWeek')}
            >
              {lang === 'he' ? '←' : '→'}
            </button>
          </div>
        )}
        <div className="surface-card flex flex-wrap items-end gap-3 p-4">
          {mode === 'vacations' ? (
            <label className="block text-sm text-slate-600">
              {t('yearLabel')}
              <select value={year} onChange={e => setYear(e.target.value)} className="field-sm mt-1 block">
                {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="block text-sm text-slate-600">
                {t('periodLabel')}
                <select
                  value={granularity}
                  onChange={e => setGranularity(e.target.value as 'month' | 'week')}
                  className="field-sm mt-1 block"
                >
                  <option value="month">{t('monthlyOption')}</option>
                  <option value="week">{t('weeklyOption')}</option>
                </select>
              </label>
              {granularity === 'month' && (
                <label className="block text-sm text-slate-600">
                  {t('monthLabel')}
                  <input
                    type="month"
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    className="field-sm mt-1 block"
                  />
                </label>
              )}
            </>
          )}
          <label className="block text-sm text-slate-600">
            {t('viewModeLabel')}
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'worker' | 'machine' | 'vacations')}
              className="field-sm mt-1 block"
            >
              <option value="worker">{t('byWorkerOption')}</option>
              <option value="machine">{t('byMachineOption')}</option>
              <option value="vacations">{t('vacationSummaryOption')}</option>
            </select>
          </label>
          {mode === 'worker' ? (
            <label className="block text-sm text-slate-600">
              {t('employeeLabel')}
              <select
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                className="field-sm mt-1 block min-w-36"
              >
                <option value="">{t('selectEmployeeOption')}</option>
                {techs.map(tc => (
                  <option key={tc.id} value={tc.id}>{tc.name}</option>
                ))}
              </select>
            </label>
          ) : mode === 'machine' ? (
            <label className="block text-sm text-slate-600">
              {t('machineStationLabel')}
              <select
                value={station}
                onChange={e => setStation(e.target.value)}
                className="field-sm mt-1 block"
              >
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {loading ? (
          <Loading />
        ) : mode === 'worker' && !workerId ? (
          <p className="py-16 text-center text-slate-500">{t('selectEmployeeToShowReport')}</p>
        ) : mode === 'vacations' ? (
          <div className="animate-fade-up space-y-6">
            {summary.length > 0 && (
              <div className="surface-card p-4">
                <h3 className="mb-3 font-bold text-slate-900">{t('absenceBreakdownHeading')}</h3>
                <AbsenceBreakdownChart data={summary} t={t} />
              </div>
            )}
            <div className="surface-card scroll-thin overflow-x-auto">
              <table className="table-shell">
                <thead>
                  <tr>
                    <th className="th-cell text-start">{t('employeeLabel')}</th>
                    <th className="th-cell text-center">{t('vacationCol')}</th>
                    <th className="th-cell text-center">{t('sickCol')}</th>
                    <th className="th-cell text-center">{t('miluimCol')}</th>
                    <th className="th-cell text-center">{t('otherCol')}</th>
                    <th className="th-cell text-center">{t('offMarkedCol')}</th>
                    <th className="th-cell text-center">{t('totalAbsenceCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.technicianId} className="odd:bg-white even:bg-slate-50/40">
                      <td className="td-cell font-semibold text-slate-800">{s.name}</td>
                      <td className="td-cell text-center">{s.vacation}</td>
                      <td className="td-cell text-center">{s.sick}</td>
                      <td className="td-cell text-center">{s.miluim}</td>
                      <td className="td-cell text-center">{s.other}</td>
                      <td className="td-cell text-center">{s.offMarked}</td>
                      <td className="td-cell text-center font-bold text-brand-700">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-6 mb-2 font-bold text-slate-900">
              {t('absenceDetailsHeading')} ({year})
            </h3>
            {absenceRows.filter(a => a.startDate <= `${year}-12-31` && a.endDate >= `${year}-01-01`).length === 0 ? (
              <p className="text-sm text-slate-500">{t('noAbsencesThisYear')}</p>
            ) : (
              <ul className="surface-card divide-y divide-slate-100 text-sm">
                {absenceRows
                  .filter(a => a.startDate <= `${year}-12-31` && a.endDate >= `${year}-01-01`)
                  .map(a => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <span className="font-semibold text-slate-800">{a.technicianName}</span>
                      <span className="text-slate-600">{absenceLabel(lang, a.type)}</span>
                      <span className="text-slate-500">
                        {formatDate(a.startDate)} – {formatDate(a.endDate)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="animate-fade-up space-y-6">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="pill">{t('totalLabel')} {filtered.length}</span>
              <span className="pill">{shiftLabel(lang, 'morning')}: {morningCount}</span>
              <span className="pill">{shiftLabel(lang, 'evening')}: {eveningCount}</span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500">{t('noShiftsInPeriod')}</p>
            ) : (
              <>
                <div className="surface-card flex flex-wrap gap-8 p-4">
                  <div>
                    <h3 className="mb-2 font-bold text-slate-900">{t('shiftsTotalHeading')}</h3>
                    <TotalsBarChart
                      morning={morningCount}
                      evening={eveningCount}
                      morningLabel={shiftLabel(lang, 'morning')}
                      eveningLabel={shiftLabel(lang, 'evening')}
                    />
                  </div>
                  {granularity === 'week' && (
                    <div>
                      <h3 className="mb-2 font-bold text-slate-900">{t('shiftsByDayHeading')}</h3>
                      <DailyShiftsChart
                        dates={periodDates}
                        countsByDate={countsByDate}
                        lang={lang}
                        morningLabel={shiftLabel(lang, 'morning')}
                        eveningLabel={shiftLabel(lang, 'evening')}
                      />
                    </div>
                  )}
                </div>
                <div className="surface-card scroll-thin overflow-x-auto">
                  <table className="table-shell">
                    <thead>
                      <tr>
                        <th className="th-cell text-center">{t('dateCol')}</th>
                        <th className="th-cell text-center">{t('dayCol')}</th>
                        <th className="th-cell text-center">{t('shiftCol')}</th>
                        <th className="th-cell text-center">
                          {mode === 'worker' ? t('machineStationLabel') : t('employeeLabel')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-slate-50/40">
                          <td className="td-cell text-center">{formatDate(r.date)}</td>
                          <td className="td-cell text-center">{dayName(r.date, lang)}</td>
                          <td className="td-cell text-center">{shiftLabel(lang, r.shift)}</td>
                          <td className="td-cell text-center">
                            {mode === 'worker' ? r.stationName : (r.technicianName ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
