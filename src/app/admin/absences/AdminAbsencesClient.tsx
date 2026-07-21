'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { absenceLabel, absenceEntries, ABSENCE_COLORS } from '@/lib/labels';
import { formatDate } from '@/lib/dates';
import { useT, translateApiError } from '@/lib/i18n';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

interface Absence {
  id: number;
  technicianId: number;
  technicianName: string;
  startDate: string;
  endDate: string;
  type: string;
}
interface Tech { id: number; name: string }

export default function AdminAbsencesClient() {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [form, setForm] = useState({ technicianId: '', type: 'vacation', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [absRes, usersRes] = await Promise.all([
        fetch('/api/admin/absences'),
        fetch('/api/admin/users'),
      ]);
      if (absRes.ok) setAbsences((await absRes.json()).absences);
      if (usersRes.ok) {
        const users = (await usersRes.json()).users as Array<Tech & { isAdmin: boolean }>;
        setTechs(users.filter(u => !u.isAdmin));
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/admin/absences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          technicianId: Number(form.technicianId),
          startDate: form.startDate,
          endDate: form.endDate,
          type: form.type,
        }),
      });
      if (res.ok) {
        setForm({ technicianId: '', type: 'vacation', startDate: '', endDate: '' });
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  async function remove(id: number) {
    setError('');
    try {
      const res = await fetch('/api/admin/absences', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('deleteFailed'));
      }
    } catch {
      setError(t('networkError'));
    }
    await load();
  }

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('addAbsenceHeading')}</h2>
          <form onSubmit={add} className="surface-card flex flex-wrap items-end gap-3 p-4">
            <label className="block text-sm text-slate-600">
              {t('employeeLabel')}
              <select
                required
                value={form.technicianId}
                onChange={e => setForm(f => ({ ...f, technicianId: e.target.value }))}
                className="field-sm mt-1 block min-w-36"
              >
                <option value="">{t('selectEmployeeOption')}</option>
                {techs.map(tc => (
                  <option key={tc.id} value={tc.id}>{tc.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              {t('typeLabel')}
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="field-sm mt-1 block"
              >
                {absenceEntries(lang).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              {t('fromDateLabel')}
              <input
                type="date"
                required
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="field-sm mt-1 block"
              />
            </label>
            <label className="block text-sm text-slate-600">
              {t('toDateInclusiveLabel')}
              <input
                type="date"
                required
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="field-sm mt-1 block"
              />
            </label>
            <button type="submit" className="btn-primary">
              {t('addBtn')}
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </section>
        <section>
          <h2 className="mb-3 font-bold text-slate-900">{t('absencesHeading')}</h2>
          {loading ? (
            <p className="py-8 text-center text-slate-500">{t('loading')}</p>
          ) : absences.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noAbsencesNote')}</p>
          ) : (
            <div className="surface-card scroll-thin overflow-x-auto">
              <table className="table-shell">
                <thead>
                  <tr>
                    <th className="th-cell text-start">{t('employeeLabel')}</th>
                    <th className="th-cell text-center">{t('typeLabel')}</th>
                    <th className="th-cell text-center">{t('fromDateLabel')}</th>
                    <th className="th-cell text-center">{t('toDateCol')}</th>
                    <th className="th-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map(a => (
                    <tr key={a.id} className="odd:bg-white even:bg-slate-50/40">
                      <td className="td-cell text-slate-800">{a.technicianName}</td>
                      <td className="td-cell text-center">
                        <span className={`badge ${ABSENCE_COLORS[a.type]}`}>{absenceLabel(lang, a.type)}</span>
                      </td>
                      <td className="td-cell text-center">{formatDate(a.startDate)}</td>
                      <td className="td-cell text-center">{formatDate(a.endDate)}</td>
                      <td className="td-cell text-center">
                        <button onClick={() => remove(a.id)} className="link-danger">
                          {t('deleteBtn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
