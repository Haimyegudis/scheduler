'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { dayName, formatDate } from '@/lib/dates';
import { shiftLabel } from '@/lib/labels';
import { useT, translateApiError } from '@/lib/i18n';

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
  assignedStationId: number | null;
}
interface Station { id: number; name: string }

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-700',
};

export default function RequestsClient({ name }: { name: string }) {
  const { t, lang } = useT();
  const TESTER_LINKS = [
    { href: '/schedule', label: t('scheduleNav') },
    { href: '/requests', label: t('myRequestsNav') },
  ];
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [shift, setShift] = useState('morning');
  const [stationId, setStationId] = useState('');
  const [description, setDescription] = useState('');
  const [swVersion, setSwVersion] = useState('');
  const [hwNotes, setHwNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tester-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests);
        setStations(data.stations);
      } else {
        setError(t('loadError'));
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/tester-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date,
          shift,
          stationId: stationId === '' ? null : Number(stationId),
          description,
          swVersion,
          hwNotes,
        }),
      });
      if (res.ok) {
        setMessage(t('requestSubmittedMsg'));
        setDescription('');
        setSwVersion('');
        setHwNotes('');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  async function cancel(id: number) {
    setError('');
    try {
      const res = await fetch('/api/tester-requests', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
    await load();
  }

  function statusLabel(status: string): string {
    if (status === 'approved') return t('statusApprovedReq');
    if (status === 'rejected') return t('statusRejectedReq');
    return t('statusPendingReq');
  }

  return (
    <div>
      <NavBar name={name} links={TESTER_LINKS} />
      <main className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}
        {message && (
          <p className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">{message}</p>
        )}
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('newRequestHeading')}</h2>
          <form onSubmit={submit} className="surface-card space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm text-slate-600">
                {t('requestDateLabel')}
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="field mt-1 w-full" />
              </label>
              <label className="text-sm text-slate-600">
                {t('requestShiftLabel')}
                <select value={shift} onChange={e => setShift(e.target.value)} className="field mt-1 w-full">
                  <option value="morning">{shiftLabel(lang, 'morning')}</option>
                  <option value="evening">{shiftLabel(lang, 'evening')}</option>
                </select>
              </label>
              <label className="text-sm text-slate-600">
                {t('requestStationLabel')}
                <select value={stationId} onChange={e => setStationId(e.target.value)} className="field mt-1 w-full">
                  <option value="">{t('anyPressOption')}</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-slate-600">
              {t('requestDescriptionLabel')}
              <textarea
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                className="field mt-1 w-full"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                {t('requestSwLabel')}
                <input value={swVersion} onChange={e => setSwVersion(e.target.value)} maxLength={500} className="field mt-1 w-full" />
              </label>
              <label className="text-sm text-slate-600">
                {t('requestHwLabel')}
                <input value={hwNotes} onChange={e => setHwNotes(e.target.value)} maxLength={500} className="field mt-1 w-full" />
              </label>
            </div>
            <button type="submit" className="btn-primary">{t('submitRequestBtn')}</button>
          </form>
        </section>
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('myRequestsHeading')}</h2>
          {loading ? (
            <Loading />
          ) : requests.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noRequestsYet')}</p>
          ) : (
            <ul className="surface-card divide-y divide-slate-100">
              {requests.map(r => (
                <li key={r.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">
                      {dayName(r.date, lang)} {formatDate(r.date)} · {shiftLabel(lang, r.shift)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {r.station?.name ?? t('anyPressOption')}
                    </span>
                    <span className={`badge ms-auto ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                      {statusLabel(r.status)}
                    </span>
                    {r.status === 'pending' && (
                      <button onClick={() => cancel(r.id)} className="link-danger text-sm">
                        {t('cancelRequestBtn')}
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{r.description}</p>
                  {(r.swVersion || r.hwNotes) && (
                    <p className="text-xs text-slate-500">
                      {r.swVersion && <span className="me-3">SW: {r.swVersion}</span>}
                      {r.hwNotes && <span>HW: {r.hwNotes}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
