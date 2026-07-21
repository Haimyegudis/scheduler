'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';
import { useT, translateApiError } from '@/lib/i18n';

const ADMIN_LINKS_KEYS = [
  { href: '/admin', key: 'dashboardNav' },
  { href: '/admin/schedule', key: 'scheduleNav' },
  { href: '/admin/users', key: 'usersNav' },
  { href: '/admin/absences', key: 'absencesNav' },
  { href: '/admin/reports', key: 'reportsNav' },
] as const;

interface AllowedEmail { id: number; email: string }
interface User { id: number; name: string; email: string; isAdmin: boolean }

export default function AdminUsersClient({ myUserId }: { myUserId: number }) {
  const { t, lang } = useT();
  const ADMIN_LINKS = ADMIN_LINKS_KEYS.map(l => ({ href: l.href, label: t(l.key) }));
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [emailsRes, usersRes] = await Promise.all([
        fetch('/api/admin/allowed-emails'),
        fetch('/api/admin/users'),
      ]);
      if (emailsRes.ok) setEmails((await emailsRes.json()).emails);
      if (usersRes.ok) setUsers((await usersRes.json()).users);
    } catch {
      setError(t('networkErrorRefresh'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      if (res.ok) {
        setNewEmail('');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('genericError'));
      }
    } catch {
      setError(t('networkError'));
    }
  }

  async function removeEmail(email: string) {
    setError('');
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
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

  async function toggleAdmin(user: User) {
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, isAdmin: !user.isAdmin }),
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

  async function deleteUser(user: User) {
    if (user.id === myUserId) return;
    if (!confirm(t('deleteUserConfirmMsg'))) return;
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ? translateApiError(lang, data.error) : t('deleteUserFailed'));
      }
    } catch {
      setError(t('networkError'));
    }
    await load();
  }

  return (
    <div>
      <NavBar name={t('adminName')} links={ADMIN_LINKS} />
      <main className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
        {error && (
          <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}
        {loading ? (
          <Loading />
        ) : (
          <div className="animate-fade-up space-y-8">
            <section>
              <h2 className="mb-3 font-bold text-slate-900">{t('allowedEmailsHeading')}</h2>
              <form onSubmit={addEmail} className="mb-3 flex gap-2">
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="tech@example.com"
                  className="field flex-1"
                />
                <button type="submit" className="btn-primary">
                  {t('addBtn')}
                </button>
              </form>
              {emails.length === 0 ? (
                <p className="text-sm text-slate-500">{t('noEmailsYetNote')}</p>
              ) : (
                <ul className="surface-card divide-y divide-slate-100">
                  {emails.map(e => (
                    <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                      <span dir="ltr" className="text-sm text-slate-700">{e.email}</span>
                      <button onClick={() => removeEmail(e.email)} className="link-danger text-sm">
                        {t('removeBtn')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="mb-3 font-bold text-slate-900">{t('registeredUsersHeading')}</h2>
              <div className="surface-card scroll-thin overflow-x-auto">
                <table className="table-shell">
                  <thead>
                    <tr>
                      <th className="th-cell text-start">{t('nameCol')}</th>
                      <th className="th-cell text-start">{t('emailCol')}</th>
                      <th className="th-cell text-center">{t('adminCol')}</th>
                      <th className="th-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="odd:bg-white even:bg-slate-50/40">
                        <td className="td-cell text-slate-800">
                          {u.name}
                          {u.id === myUserId && <span className="ms-1 text-slate-400">{t('meSuffix')}</span>}
                        </td>
                        <td className="td-cell" dir="ltr">{u.email}</td>
                        <td className="td-cell text-center">
                          <input
                            type="checkbox"
                            checked={u.isAdmin}
                            disabled={u.id === myUserId}
                            onChange={() => toggleAdmin(u)}
                            className="h-4 w-4 accent-brand-600"
                          />
                        </td>
                        <td className="td-cell text-center">
                          <button
                            onClick={() => deleteUser(u)}
                            disabled={u.id === myUserId}
                            className={
                              u.id === myUserId ? 'cursor-not-allowed text-sm text-slate-300' : 'link-danger text-sm'
                            }
                          >
                            {t('deleteUserBtn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">{t('adminPermNote')}</p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
