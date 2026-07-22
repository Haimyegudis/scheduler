'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import ColorPopover from '@/components/ColorPopover';
import ScheduleTable from '@/components/ScheduleTable';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { shiftLabel, constraintLabel, absenceLabel } from '@/lib/labels';
import { useT, translateApiError, type DictKey } from '@/lib/i18n';
import { colorClass, pressLabelClass, pressRowClass, pressLabelHex, type ColorToken } from '@/lib/cellColors';
import { buildScheduleHtmlTable, buildScheduleText, type ScheduleExportGroup } from '@/lib/exportSchedule';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

const SHIFTS = ['morning', 'evening'] as const;

type CellKey = string; // `${date}|${shift}|${stationId}`
const key = (date: string, shift: string, stationId: number): CellKey => `${date}|${shift}|${stationId}`;

interface Tech { id: number; name: string }
interface Station { id: number; name: string; position: number; active: boolean }
interface CellValue { technicianId: number | ''; experimenter: string; note: string; color: string | null }

const emptyCell: CellValue = { technicianId: '', experimenter: '', note: '', color: null };

const COLOR_NAME_KEYS: Record<ColorToken, DictKey> = {
  red: 'colorRed',
  orange: 'colorOrange',
  yellow: 'colorYellow',
  green: 'colorGreen',
  teal: 'colorTeal',
  blue: 'colorBlue',
  purple: 'colorPurple',
  pink: 'colorPink',
};

export default function AdminScheduleClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [includeFriday, setIncludeFriday] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<CellKey, CellValue>>({});
  const [technicians, setTechnicians] = useState<Tech[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [constraints, setConstraints] = useState<Record<string, Record<string, string>>>({});
  const [absences, setAbsences] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [stationsOpen, setStationsOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [stationDrafts, setStationDrafts] = useState<Record<number, string>>({});
  const [stationsMessage, setStationsMessage] = useState('');
  const [colorPopoverKey, setColorPopoverKey] = useState<CellKey | null>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(
    null
  );

  const loadStations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stations');
      if (res.ok) {
        const data = await res.json();
        setStations(data.stations);
        setStationDrafts(Object.fromEntries(data.stations.map((s: Station) => [s.id, s.name])));
      }
    } catch {
      // ignore; board still renders with whatever we last had
    }
  }, []);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setMessage('');
    setEditing(false);
    try {
      const [schedRes, overviewRes] = await Promise.all([
        fetch(`/api/schedule?weekStart=${ws}`),
        fetch(`/api/admin/overview?weekStart=${ws}`),
      ]);
      await loadStations();
      if (schedRes.ok && overviewRes.ok) {
        const sched = await schedRes.json();
        const overview = await overviewRes.json();
        setTechnicians(sched.technicians);
        setConstraints(overview.constraints);
        setAbsences(overview.absences ?? {});
        setIncludeFriday(sched.schedule?.includeFriday ?? overview.includeFriday ?? false);
        setStatus(sched.schedule?.status ?? null);
        const next: Record<CellKey, CellValue> = {};
        for (const a of sched.schedule?.assignments ?? []) {
          next[key(a.date, a.shift, a.stationId)] = {
            technicianId: a.technicianId ?? '',
            experimenter: a.experimenter ?? '',
            note: a.note ?? '',
            color: a.color ?? null,
          };
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
  }, [t, loadStations]);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const dates = weekDates(weekStart, includeFriday);
  // Board shows active stations plus any station referenced by currently loaded
  // cells, so historical assignments on a since-deactivated station stay visible.
  const boardStations = useMemo(() => {
    const referencedIds = new Set(
      Object.keys(cells)
        .map(k => Number(k.split('|')[2]))
        .filter(id => !Number.isNaN(id))
    );
    return stations
      .filter(s => s.active || referencedIds.has(s.id))
      .sort((a, b) => a.position - b.position);
  }, [stations, cells]);

  const assignmentsPayload = useMemo(() => {
    const validDates = new Set(weekDates(weekStart, includeFriday));
    return Object.entries(cells)
      .filter(
        ([, v]) => v.technicianId !== '' || v.experimenter.trim() !== '' || v.note.trim() !== '' || v.color !== null
      )
      .map(([k, v]) => {
        const [date, shift, stationId] = k.split('|');
        return {
          date,
          shift,
          stationId: Number(stationId),
          technicianId: v.technicianId === '' ? null : v.technicianId,
          experimenter: v.experimenter.trim() || undefined,
          note: v.note.trim() || undefined,
          color: v.color,
        };
      })
      .filter(a => validDates.has(a.date));
  }, [cells, weekStart, includeFriday]);

  const shiftCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of assignmentsPayload) {
      if (a.technicianId !== null) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
    }
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

  function updateCell(k: CellKey, patch: Partial<CellValue>) {
    setCells(c => ({ ...c, [k]: { ...(c[k] ?? emptyCell), ...patch } }));
  }

  // "Name · Morning/Evening/Morning+Evening" availability hint shown in each board <option>.
  function dayRequestSuffix(techId: number, date: string): string {
    const c = constraints[String(techId)]?.[date];
    if (c === 'flex') return t('bothShiftsLabel');
    if (c === 'morning') return constraintLabel(lang, 'morning');
    if (c === 'evening') return constraintLabel(lang, 'evening');
    if (c === 'off') return constraintLabel(lang, 'off');
    return t('boardUnfilledMark');
  }

  // Sort order: exact shift match first, then flex (both), then unfilled/mismatch.
  function optionPriority(techId: number, date: string, shift: string): number {
    const c = constraints[String(techId)]?.[date];
    if (c === shift) return 0;
    if (c === 'flex') return 1;
    return 2;
  }

  function openColorPopover(k: CellKey, current: string | null, anchorEl: HTMLButtonElement) {
    const r = anchorEl.getBoundingClientRect();
    setPopoverAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    setPendingColor(current);
    setColorPopoverKey(prev => (prev === k ? null : k));
  }

  function pickColor(k: CellKey, token: ColorToken) {
    setPendingColor(token);
    updateCell(k, { color: token });
  }

  function clearCellColor(k: CellKey) {
    setPendingColor(null);
    updateCell(k, { color: null });
  }

  function applyColorToRow(shift: string, stationId: number, color: string | null) {
    setCells(c => {
      const next = { ...c };
      for (const date of dates) {
        const k = key(date, shift, stationId);
        next[k] = { ...(next[k] ?? emptyCell), color };
      }
      return next;
    });
  }

  function applyColorToColumn(date: string, color: string | null) {
    setCells(c => {
      const next = { ...c };
      for (const shift of SHIFTS) {
        for (const station of boardStations) {
          const k = key(date, shift, station.id);
          next[k] = { ...(next[k] ?? emptyCell), color };
        }
      }
      return next;
    });
  }

  async function copySchedule() {
    try {
      const days = dates.map(d => ({ date: d, label: `${dayName(d, lang)} ${formatDate(d)}` }));
      const groups: ScheduleExportGroup[] = boardStations.map((station, si) => ({
        pressLabel: station.name,
        pressColorHex: pressLabelHex(si),
        shifts: SHIFTS.map(shift => ({
          shiftLabel: shiftLabel(lang, shift),
          cells: Object.fromEntries(
            dates.map(date => {
              const v = cells[key(date, shift, station.id)] ?? emptyCell;
              const techName = v.technicianId === '' ? null : technicians.find(tc => tc.id === v.technicianId)?.name ?? null;
              return [
                date,
                { technicianName: techName, experimenter: v.experimenter || null, note: v.note || null, color: v.color },
              ];
            })
          ),
        })),
      }));
      const html = buildScheduleHtmlTable(t('shiftStationHeader'), days, groups);
      const text = buildScheduleText(t('shiftStationHeader'), days, groups);
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      setMessage(t('copyScheduleSuccessMsg'));
    } catch {
      setMessage(t('copyScheduleFailedMsg'));
    }
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
        setEditing(false);
        setMessage(t('schedulePublishedMsg'));
      } else {
        setMessage(t('publishFailed'));
      }
    } catch {
      setMessage(t('networkErrorPublishFailed'));
    }
  }

  async function addStation() {
    const name = newStationName.trim();
    if (!name) return;
    setStationsMessage('');
    try {
      const res = await fetch('/api/admin/stations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNewStationName('');
        await loadStations();
      } else {
        const data = await res.json().catch(() => ({}));
        setStationsMessage(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setStationsMessage(t('networkError'));
    }
  }

  async function renameStation(id: number) {
    const name = (stationDrafts[id] ?? '').trim();
    const current = stations.find(s => s.id === id);
    if (!name || !current || name === current.name) return;
    setStationsMessage('');
    try {
      const res = await fetch('/api/admin/stations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      if (res.ok) {
        await loadStations();
      } else {
        const data = await res.json().catch(() => ({}));
        setStationsMessage(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setStationsMessage(t('networkError'));
    }
  }

  async function toggleStationActive(id: number, active: boolean) {
    setStationsMessage('');
    try {
      const res = await fetch('/api/admin/stations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, active }),
      });
      if (res.ok) {
        await loadStations();
      } else {
        const data = await res.json().catch(() => ({}));
        setStationsMessage(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setStationsMessage(t('networkError'));
    }
  }

  // Published schedules render a clean read-only board by default; "Edit schedule" flips
  // into the full editing grid without touching the schedule's status on the server.
  const cleanView = status === 'published' && !editing;

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />

        {!cleanView && (
          <div className="surface-card mb-4 overflow-hidden">
            <button
              onClick={() => setStationsOpen(o => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-start font-bold text-slate-800 transition hover:bg-slate-50"
              aria-expanded={stationsOpen}
            >
              <span>{t('stationsHeading')}</span>
              <span
                className={`text-slate-400 transition-transform duration-200 ${stationsOpen ? 'rotate-180' : ''}`}
                aria-hidden
              >
                ▾
              </span>
            </button>
            {stationsOpen && (
              <div className="border-t border-slate-100 px-4 pt-3 pb-4">
                {stationsMessage && <p className="mb-2 text-sm text-rose-600">{stationsMessage}</p>}
                {stations.length === 0 && <p className="mb-2 text-sm text-slate-500">{t('noStationsHint')}</p>}
                <ul className="mb-3 divide-y divide-slate-100">
                  {stations
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map(s => (
                      <li key={s.id} className="flex items-center gap-2 py-2">
                        <input
                          value={stationDrafts[s.id] ?? s.name}
                          onChange={e => setStationDrafts(d => ({ ...d, [s.id]: e.target.value }))}
                          onBlur={() => renameStation(s.id)}
                          className={`field-sm flex-1 ${s.active ? '' : 'text-slate-400'}`}
                        />
                        <button
                          onClick={() => toggleStationActive(s.id, !s.active)}
                          className="btn-secondary btn-sm whitespace-nowrap"
                        >
                          {s.active ? t('deactivateBtn') : t('activateBtn')}
                        </button>
                      </li>
                    ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    value={newStationName}
                    onChange={e => setNewStationName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addStation()}
                    placeholder={t('stationNamePlaceholder')}
                    className="field-sm flex-1"
                  />
                  <button onClick={addStation} className="btn-primary btn-sm">
                    {t('addBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <Loading />
        ) : cleanView ? (
          <div className="animate-fade-up">
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <span className="badge bg-emerald-100 text-emerald-800">
                {t('statusPrefix')} {t('statusPublished')}
              </span>
              <button onClick={copySchedule} className="btn-secondary">
                {t('copyScheduleBtn')}
              </button>
              <button onClick={() => setEditing(true)} className="btn-primary ms-auto">
                {t('editScheduleBtn')}
              </button>
            </div>
            {message && (
              <p className="mb-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                {message}
              </p>
            )}
            <ScheduleTable dates={dates} assignments={assignmentsPayload} technicians={technicians} stations={boardStations} />
          </div>
        ) : (
          <div className="animate-fade-up">
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <button onClick={generate} className="btn-primary">
                {t('generateScheduleBtn')}
              </button>
              <button onClick={() => saveDraft()} className="btn-secondary">
                {t('saveDraftBtn')}
              </button>
              <button onClick={publish} className="btn-success">
                {t('publishBtn')}
              </button>
              <button onClick={copySchedule} className="btn-secondary">
                {t('copyScheduleBtn')}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={includeFriday}
                  onChange={e => toggleFriday(e.target.checked)}
                  className="h-4 w-4 accent-brand-600"
                />
                {t('includeFridayLabel')}
              </label>
              <span
                className={`badge ms-auto ${
                  status === 'published'
                    ? 'bg-emerald-100 text-emerald-800'
                    : status === 'draft'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t('statusPrefix')} {status === 'published' ? t('statusPublished') : status === 'draft' ? t('statusDraft') : t('statusNone')}
              </span>
            </div>
            {message && (
              <p className="mb-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                {message}
              </p>
            )}
            {boardStations.length === 0 ? (
              <p className="py-16 text-center text-slate-500">{t('noActiveStationsBoardHint')}</p>
            ) : (
              <div className="surface-card scroll-thin overflow-x-auto">
                <table className="table-shell">
                  <thead>
                    <tr>
                      <th className="th-cell sticky start-0 z-20 w-52 text-start" colSpan={2}>
                        {t('shiftStationHeader')}
                      </th>
                      {dates.map(d => (
                        <th key={d} className="th-cell text-center">
                          {dayName(d, lang)}
                          <div className="text-[11px] font-normal tracking-normal text-slate-400 normal-case">{formatDate(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boardStations.flatMap((station, si) =>
                      SHIFTS.map((shift, shi) => (
                        <tr key={`${station.id}-${shift}`}>
                          {shi === 0 && (
                            <td
                              rowSpan={2}
                              className={`td-cell sticky start-0 z-10 w-28 align-top whitespace-nowrap font-semibold ${pressLabelClass(
                                si
                              )} ${station.active ? 'text-slate-700' : 'text-slate-400'}`}
                            >
                              {station.name}
                            </td>
                          )}
                          <td
                            className={`td-cell sticky start-28 z-10 w-24 whitespace-nowrap font-semibold ${pressRowClass(si)} ${
                              station.active ? 'text-slate-600' : 'text-slate-400'
                            }`}
                          >
                            {shiftLabel(lang, shift)}
                          </td>
                          {dates.map(date => {
                            const k = key(date, shift, station.id);
                            const v = cells[k] ?? emptyCell;
                            const warning = warningsFor(date, shift, v.technicianId);
                            const hasContent = v.technicianId !== '' || v.experimenter.trim() !== '' || v.note.trim() !== '';
                            const cellColorClass = colorClass(v.color);
                            const bgClass = cellColorClass || (!hasContent ? 'bg-rose-50/60' : pressRowClass(si));
                            return (
                              <td key={date} className={`relative border-b border-slate-100 p-1.5 align-top ${bgClass}`}>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    aria-label={t('colorPickerLabel')}
                                    onClick={e => openColorPopover(k, v.color, e.currentTarget)}
                                    className={`h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 shadow-sm transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                                      cellColorClass || 'bg-white'
                                    }`}
                                  />
                                </div>
                                <select
                                  value={v.technicianId}
                                  onChange={e =>
                                    updateCell(k, { technicianId: e.target.value === '' ? '' : Number(e.target.value) })
                                  }
                                  aria-label={t('assignTechnicianAria')}
                                  className="w-full rounded-md border-0 bg-transparent text-center text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                                >
                                  <option value=""></option>
                                  {technicians
                                    .filter(
                                      tc =>
                                        (constraints[String(tc.id)]?.[date] !== 'off' &&
                                          !absences[String(tc.id)]?.[date]) ||
                                        tc.id === v.technicianId
                                    )
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        optionPriority(a.id, date, shift) - optionPriority(b.id, date, shift) ||
                                        a.name.localeCompare(b.name)
                                    )
                                    .map(tc => (
                                      <option key={tc.id} value={tc.id}>
                                        {tc.name} · {dayRequestSuffix(tc.id, date)}
                                      </option>
                                    ))}
                                </select>
                                <input
                                  value={v.experimenter}
                                  onChange={e => updateCell(k, { experimenter: e.target.value })}
                                  placeholder={t('experimenterInputPlaceholder')}
                                  className="field-sm mt-1 w-full px-1.5 py-1 text-xs"
                                />
                                <input
                                  value={v.note}
                                  onChange={e => updateCell(k, { note: e.target.value })}
                                  placeholder={t('noteInputPlaceholder')}
                                  className="field-sm mt-1 w-full px-1.5 py-1 text-xs"
                                />
                                {warning && (
                                  <div className="mt-1 text-center text-[11px] leading-tight text-orange-600">
                                    ⚠ {warning}
                                  </div>
                                )}
                                {colorPopoverKey === k && popoverAnchor && (
                                  <ColorPopover
                                    anchorRect={popoverAnchor}
                                    pendingColor={pendingColor}
                                    colorNameKeys={COLOR_NAME_KEYS}
                                    onPick={tok => pickColor(k, tok)}
                                    onClear={() => clearCellColor(k)}
                                    onApplyRow={() => applyColorToRow(shift, station.id, pendingColor)}
                                    onClearRow={() => applyColorToRow(shift, station.id, null)}
                                    onApplyColumn={() => applyColorToColumn(date, pendingColor)}
                                    onClearColumn={() => applyColorToColumn(date, null)}
                                    onClose={() => setColorPopoverKey(null)}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <h3 className="mt-8 mb-2 font-bold text-slate-900">{t('shiftsPerTechnicianHeading')}</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {technicians.map(tc => (
                <span key={tc.id} className="pill">
                  {tc.name}: <span className="font-semibold text-slate-800">{shiftCounts.get(tc.id) ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
