'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import WeekNav from '@/components/WeekNav';
import Loading from '@/components/Loading';
import { getCurrentWeekStart, weekDates, dayName, formatDate } from '@/lib/dates';
import { shiftLabel, constraintLabel, absenceLabel } from '@/lib/labels';
import { useT, translateApiError, type DictKey } from '@/lib/i18n';
import { COLOR_TOKENS, COLOR_CLASSES, colorClass, type ColorToken } from '@/lib/cellColors';
import { buildScheduleHtmlTable, buildScheduleText } from '@/lib/exportSchedule';

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
  const [stationsOpen, setStationsOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [stationDrafts, setStationDrafts] = useState<Record<number, string>>({});
  const [stationsMessage, setStationsMessage] = useState('');
  const [colorPopoverKey, setColorPopoverKey] = useState<CellKey | null>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);

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

  function openColorPopover(k: CellKey, current: string | null) {
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
      const rows = SHIFTS.flatMap(shift =>
        boardStations.map(station => ({
          label: `${shiftLabel(lang, shift)} · ${station.name}`,
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
        }))
      );
      const html = buildScheduleHtmlTable(t('shiftStationHeader'), days, rows);
      const text = buildScheduleText(t('shiftStationHeader'), days, rows);
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

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="max-w-6xl mx-auto p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />

        <div className="bg-white rounded-lg shadow-sm mb-4">
          <button
            onClick={() => setStationsOpen(o => !o)}
            className="w-full text-start px-4 py-2 font-bold flex items-center justify-between"
          >
            <span>{t('stationsHeading')}</span>
            <span>{stationsOpen ? '▲' : '▼'}</span>
          </button>
          {stationsOpen && (
            <div className="px-4 pb-4">
              {stationsMessage && <p className="text-sm text-red-600 mb-2">{stationsMessage}</p>}
              {stations.length === 0 && <p className="text-sm text-gray-500 mb-2">{t('noStationsHint')}</p>}
              <ul className="divide-y mb-3">
                {stations
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map(s => (
                    <li key={s.id} className="flex items-center gap-2 py-2">
                      <input
                        value={stationDrafts[s.id] ?? s.name}
                        onChange={e => setStationDrafts(d => ({ ...d, [s.id]: e.target.value }))}
                        onBlur={() => renameStation(s.id)}
                        className={`border rounded px-2 py-1 text-sm flex-1 ${s.active ? '' : 'text-gray-400'}`}
                      />
                      <button
                        onClick={() => toggleStationActive(s.id, !s.active)}
                        className="text-sm border rounded px-3 py-1 hover:bg-gray-100 whitespace-nowrap"
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
                  className="border rounded px-2 py-1 text-sm flex-1"
                />
                <button
                  onClick={addStation}
                  className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700"
                >
                  {t('addBtn')}
                </button>
              </div>
            </div>
          )}
        </div>

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
              <button onClick={copySchedule} className="bg-white border rounded px-4 py-2 hover:bg-gray-100">
                {t('copyScheduleBtn')}
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
            {boardStations.length === 0 ? (
              <p className="text-center text-gray-500 py-8">{t('noActiveStationsBoardHint')}</p>
            ) : (
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
                      boardStations.map(station => (
                        <tr key={`${shift}-${station.id}`}>
                          <td
                            className={`border p-2 bg-gray-50 whitespace-nowrap ${
                              station.active ? '' : 'text-gray-400'
                            }`}
                          >
                            {shiftLabel(lang, shift)} · {station.name}
                          </td>
                          {dates.map(date => {
                            const k = key(date, shift, station.id);
                            const v = cells[k] ?? emptyCell;
                            const warning = warningsFor(date, shift, v.technicianId);
                            const hasContent = v.technicianId !== '' || v.experimenter.trim() !== '' || v.note.trim() !== '';
                            const cellColorClass = colorClass(v.color);
                            const bgClass = cellColorClass || (!hasContent ? 'bg-red-50' : '');
                            return (
                              <td key={date} className={`relative border p-1 align-top ${bgClass}`}>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    aria-label={t('colorPickerLabel')}
                                    onClick={() => openColorPopover(k, v.color)}
                                    className={`w-3.5 h-3.5 rounded-full border border-gray-400 shrink-0 ${
                                      cellColorClass || 'bg-white'
                                    }`}
                                  />
                                </div>
                                <select
                                  value={v.technicianId}
                                  onChange={e =>
                                    updateCell(k, { technicianId: e.target.value === '' ? '' : Number(e.target.value) })
                                  }
                                  aria-label={t('emptySelectOption')}
                                  className="w-full border-0 bg-transparent text-center text-xs"
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
                                  className="w-full border rounded px-1 text-xs mt-1"
                                />
                                <input
                                  value={v.note}
                                  onChange={e => updateCell(k, { note: e.target.value })}
                                  placeholder={t('noteInputPlaceholder')}
                                  className="w-full border rounded px-1 text-xs mt-1"
                                />
                                {warning && <div className="text-xs text-orange-600 text-center">⚠ {warning}</div>}
                                {colorPopoverKey === k && (
                                  <div className="absolute z-20 top-6 end-0 bg-white border rounded shadow-lg p-2 w-40 text-xs space-y-1">
                                    <div className="grid grid-cols-4 gap-1 mb-1">
                                      {COLOR_TOKENS.map(tok => (
                                        <button
                                          key={tok}
                                          type="button"
                                          aria-label={t(COLOR_NAME_KEYS[tok])}
                                          onClick={() => pickColor(k, tok)}
                                          className={`w-6 h-6 rounded ${COLOR_CLASSES[tok]} ${
                                            pendingColor === tok ? 'ring-2 ring-blue-600' : ''
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => clearCellColor(k)}
                                      className="w-full text-start px-1 py-0.5 hover:bg-gray-100 rounded"
                                    >
                                      {t('clearColorBtn')}
                                    </button>
                                    <hr />
                                    <button
                                      type="button"
                                      disabled={!pendingColor}
                                      onClick={() => applyColorToRow(shift, station.id, pendingColor)}
                                      className="w-full text-start px-1 py-0.5 hover:bg-gray-100 rounded disabled:opacity-40"
                                    >
                                      {t('applyRowColorBtn')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => applyColorToRow(shift, station.id, null)}
                                      className="w-full text-start px-1 py-0.5 hover:bg-gray-100 rounded"
                                    >
                                      {t('clearRowColorBtn')}
                                    </button>
                                    <hr />
                                    <button
                                      type="button"
                                      disabled={!pendingColor}
                                      onClick={() => applyColorToColumn(date, pendingColor)}
                                      className="w-full text-start px-1 py-0.5 hover:bg-gray-100 rounded disabled:opacity-40"
                                    >
                                      {t('applyColumnColorBtn')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => applyColorToColumn(date, null)}
                                      className="w-full text-start px-1 py-0.5 hover:bg-gray-100 rounded"
                                    >
                                      {t('clearColumnColorBtn')}
                                    </button>
                                  </div>
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
