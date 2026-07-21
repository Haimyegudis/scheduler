'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel, absenceLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';

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

export default function AdminReportsClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [month, setMonth] = useState(currentMonth());
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
      : rows.filter(r => String(r.stationId) === station);

  const morningCount = filtered.filter(r => r.shift === 'morning').length;
  const eveningCount = filtered.filter(r => r.shift === 'evening').length;

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-3">
          {mode === 'vacations' ? (
            <label className="block text-sm">
              {t('yearLabel')}
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
              {t('monthLabel')}
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5"
              />
            </label>
          )}
          <label className="block text-sm">
            {t('viewModeLabel')}
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'worker' | 'machine' | 'vacations')}
              className="block mt-1 border rounded px-2 py-1.5"
            >
              <option value="worker">{t('byWorkerOption')}</option>
              <option value="machine">{t('byMachineOption')}</option>
              <option value="vacations">{t('vacationSummaryOption')}</option>
            </select>
          </label>
          {mode === 'worker' ? (
            <label className="block text-sm">
              {t('employeeLabel')}
              <select
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5 min-w-36"
              >
                <option value="">{t('selectEmployeeOption')}</option>
                {techs.map(tc => (
                  <option key={tc.id} value={tc.id}>{tc.name}</option>
                ))}
              </select>
            </label>
          ) : mode === 'machine' ? (
            <label className="block text-sm">
              {t('machineStationLabel')}
              <select
                value={station}
                onChange={e => setStation(e.target.value)}
                className="block mt-1 border rounded px-2 py-1.5"
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
          <p className="text-center text-gray-500 py-8">{t('selectEmployeeToShowReport')}</p>
        ) : mode === 'vacations' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100 text-start">{t('employeeLabel')}</th>
                    <th className="border p-2 bg-gray-100">{t('vacationCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('sickCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('miluimCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('otherCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('offMarkedCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('totalAbsenceCol')}</th>
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
            <h3 className="font-bold mt-4 mb-2">{t('absenceDetailsHeading')} ({year})</h3>
            {absenceRows.filter(a => a.startDate <= `${year}-12-31` && a.endDate >= `${year}-01-01`).length === 0 ? (
              <p className="text-gray-500 text-sm">{t('noAbsencesThisYear')}</p>
            ) : (
              <ul className="bg-white rounded-lg shadow-sm divide-y text-sm">
                {absenceRows
                  .filter(a => a.startDate <= `${year}-12-31` && a.endDate >= `${year}-01-01`)
                  .map(a => (
                    <li key={a.id} className="px-3 py-2 flex flex-wrap gap-2">
                      <span className="font-semibold">{a.technicianName}</span>
                      <span>{absenceLabel(lang, a.type)}</span>
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
              <span className="bg-white border rounded-full px-3 py-1">{t('totalLabel')} {filtered.length}</span>
              <span className="bg-white border rounded-full px-3 py-1">{shiftLabel(lang, 'morning')}: {morningCount}</span>
              <span className="bg-white border rounded-full px-3 py-1">{shiftLabel(lang, 'evening')}: {eveningCount}</span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('noShiftsInPeriod')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100">{t('dateCol')}</th>
                      <th className="border p-2 bg-gray-100">{t('dayCol')}</th>
                      <th className="border p-2 bg-gray-100">{t('shiftCol')}</th>
                      <th className="border p-2 bg-gray-100">
                        {mode === 'worker' ? t('machineStationLabel') : t('employeeLabel')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i}>
                        <td className="border p-2 text-center">{formatDate(r.date)}</td>
                        <td className="border p-2 text-center">{dayName(r.date, lang)}</td>
                        <td className="border p-2 text-center">{shiftLabel(lang, r.shift)}</td>
                        <td className="border p-2 text-center">
                          {mode === 'worker' ? r.stationName : (r.technicianName ?? '—')}
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
