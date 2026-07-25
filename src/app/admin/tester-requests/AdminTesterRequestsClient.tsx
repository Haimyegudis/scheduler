'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel } from '@/lib/labels';
import { useT, translateApiError } from '@/lib/i18n';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/tester-requests', key: 'testerRequestsNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

interface RequestRow {
  id: number;
  date: string;
  shift: string;
  stationId: number | null;
  station: { name: string } | null;
  swVersion: string | null;
  hwNotes: string | null;
  description: string;
  status: string;
  tester: { id: number; name: string };
}
interface Station { id: number; name: string; position: number; active: boolean }
interface User { id: number; name: string; role: string }

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-700',
};

export default function AdminTesterRequestsClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [testers, setTesters] = useState<User[]>([]);
  const [stationPick, setStationPick] = useState<Record<number, number | ''>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formTesterId, setFormTesterId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formShift, setFormShift] = useState('morning');
  const [formStationId, setFormStationId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSw, setFormSw] = useState('');
  const [formHw, setFormHw] = useState('');

  const load = useCallback(async () => {
    try {
      const [reqRes, stationsRes, usersRes] = await Promise.all([
        fetch('/api/admin/tester-requests'),
        fetch('/api/admin/stations'),
        fetch('/api/admin/users'),
      ]);
      if (reqRes.ok) {
        const { requests } = await reqRes.json();
        setRequests(requests);
        setStationPick(
          Object.fromEntries(requests.map((r: RequestRow) => [r.id, r.stationId ?? '']))
        );
      } else {
        setError(t('loadError'));
      }
      if (stationsRes.ok) setStations((await stationsRes.json()).stations);
      if (usersRes.ok) {
        const { users } = await usersRes.json();
        setTesters(users.filter((u: User) => u.role === 'tester'));
      }
    } catch {
      setError(t('networkErrorRefresh'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function addRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/tester-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testerId: formTesterId === '' ? null : Number(formTesterId),
          date: formDate,
          shift: formShift,
          stationId: formStationId === '' ? null : Number(formStationId),
          description: formDescription,
          swVersion: formSw,
          hwNotes: formHw,
        }),
      });
      if (res.ok) {
        setMessage(t('requestAddedMsg'));
        setFormDescription('');
        setFormSw('');
        setFormHw('');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  async function decide(r: RequestRow, action: 'approve' | 'reject') {
    const pick = stationPick[r.id];
    if (action === 'approve') {
      if (pick === '' || pick === undefined) return;
      if (!confirm(t('approvePlaceConfirm'))) return;
    }
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/tester-requests', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          action === 'approve' ? { id: r.id, action, stationId: pick, place: true } : { id: r.id, action }
        ),
      });
      if (res.ok) {
        setMessage(action === 'approve' ? t('requestApprovedMsg') : t('requestRejectedMsg'));
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  function statusLabel(status: string): string {
    if (status === 'approved') return t('statusApprovedReq');
    if (status === 'rejected') return t('statusRejectedReq');
    return t('statusPendingReq');
  }

  const activeStations = stations.filter(s => s.active).sort((a, b) => a.position - b.position);
  const dates = [...new Set(requests.map(r => r.date))].sort();

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}
        {message && (
          <p className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">{message}</p>
        )}
        {loading ? (
          <Loading />
        ) : (
          <div className="animate-fade-up space-y-8">
            <section>
              <h2 className="mb-3 font-bold text-slate-900">{t('addRequestManuallyHeading')}</h2>
              <form onSubmit={addRequest} className="surface-card space-y-3 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="text-sm text-slate-600">
                    {t('selectTesterLabel')}
                    <select
                      required
                      value={formTesterId}
                      onChange={e => setFormTesterId(e.target.value)}
                      className="field mt-1 w-full"
                    >
                      <option value=""></option>
                      {testers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-600">
                    {t('requestDateLabel')}
                    <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)} className="field mt-1 w-full" />
                  </label>
                  <label className="text-sm text-slate-600">
                    {t('requestShiftLabel')}
                    <select value={formShift} onChange={e => setFormShift(e.target.value)} className="field mt-1 w-full">
                      <option value="morning">{shiftLabel(lang, 'morning')}</option>
                      <option value="evening">{shiftLabel(lang, 'evening')}</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-600">
                    {t('requestStationLabel')}
                    <select value={formStationId} onChange={e => setFormStationId(e.target.value)} className="field mt-1 w-full">
                      <option value="">{t('anyPressOption')}</option>
                      {activeStations.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm text-slate-600">
                  {t('requestDescriptionLabel')}
                  <textarea
                    required
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="field mt-1 w-full"
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    {t('requestSwLabel')}
                    <input value={formSw} onChange={e => setFormSw(e.target.value)} maxLength={500} className="field mt-1 w-full" />
                  </label>
                  <label className="text-sm text-slate-600">
                    {t('requestHwLabel')}
                    <input value={formHw} onChange={e => setFormHw(e.target.value)} maxLength={500} className="field mt-1 w-full" />
                  </label>
                </div>
                <button type="submit" className="btn-primary">{t('addBtn')}</button>
              </form>
            </section>
            <section>
              <h2 className="mb-3 font-bold text-slate-900">{t('testerRequestsHeading')}</h2>
              {dates.length === 0 ? (
                <p className="text-sm text-slate-500">{t('noUpcomingRequests')}</p>
              ) : (
                <div className="surface-card divide-y divide-slate-100">
                  {dates.map(d => (
                    <div key={d} className="px-4 py-3">
                      <p className="mb-2 text-sm font-semibold text-slate-700">
                        {dayName(d, lang)} {formatDate(d)}
                      </p>
                      <ul className="space-y-2">
                        {requests
                          .filter(r => r.date === d)
                          .map(r => (
                            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium text-slate-800">{r.tester.name}</span>
                              <span className="text-slate-500">
                                {shiftLabel(lang, r.shift)} · {r.station?.name ?? t('anyPressOption')}
                              </span>
                              {r.status === 'pending' ? (
                                <span className="ms-auto flex items-center gap-2">
                                  <select
                                    value={stationPick[r.id] ?? ''}
                                    onChange={e =>
                                      setStationPick(p => ({
                                        ...p,
                                        [r.id]: e.target.value === '' ? '' : Number(e.target.value),
                                      }))
                                    }
                                    className="field-sm text-xs"
                                  >
                                    <option value="">{t('stationLabel')}…</option>
                                    {activeStations.map(s => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => decide(r, 'approve')}
                                    disabled={stationPick[r.id] === '' || stationPick[r.id] === undefined}
                                    className="btn-success btn-sm"
                                  >
                                    {t('approveBtn')}
                                  </button>
                                  <button onClick={() => decide(r, 'reject')} className="btn-secondary btn-sm">
                                    {t('rejectBtn')}
                                  </button>
                                </span>
                              ) : (
                                <span className={`badge ms-auto ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                                  {statusLabel(r.status)}
                                </span>
                              )}
                              <span className="basis-full text-slate-600">{r.description}</span>
                              {(r.swVersion || r.hwNotes) && (
                                <span className="basis-full text-xs text-slate-500">
                                  {r.swVersion && <span className="me-3">{t('swShortLabel')}: {r.swVersion}</span>}
                                  {r.hwNotes && <span>{t('hwShortLabel')}: {r.hwNotes}</span>}
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
