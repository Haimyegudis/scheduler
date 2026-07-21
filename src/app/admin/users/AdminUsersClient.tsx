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
      <main className="max-w-3xl mx-auto p-4 space-y-8">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loading ? (
          <Loading />
        ) : (
          <>
            <section>
              <h2 className="font-bold mb-2">{t('allowedEmailsHeading')}</h2>
              <form onSubmit={addEmail} className="flex gap-2 mb-3">
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="tech@example.com"
                  className="border rounded px-3 py-2 flex-1"
                />
                <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                  {t('addBtn')}
                </button>
              </form>
              {emails.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('noEmailsYetNote')}</p>
              ) : (
                <ul className="bg-white rounded-lg shadow-sm divide-y">
                  {emails.map(e => (
                    <li key={e.id} className="flex items-center justify-between px-3 py-2">
                      <span dir="ltr">{e.email}</span>
                      <button onClick={() => removeEmail(e.email)} className="text-red-600 text-sm hover:underline">
                        {t('removeBtn')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="font-bold mb-2">{t('registeredUsersHeading')}</h2>
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100 text-start">{t('nameCol')}</th>
                    <th className="border p-2 bg-gray-100 text-start">{t('emailCol')}</th>
                    <th className="border p-2 bg-gray-100">{t('adminCol')}</th>
                    <th className="border p-2 bg-gray-100"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="border p-2">{u.name}{u.id === myUserId && ` ${t('meSuffix')}`}</td>
                      <td className="border p-2" dir="ltr">{u.email}</td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={u.isAdmin}
                          disabled={u.id === myUserId}
                          onChange={() => toggleAdmin(u)}
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={u.id === myUserId}
                          className={`text-sm ${
                            u.id === myUserId ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:underline'
                          }`}
                        >
                          {t('deleteUserBtn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">
                {t('adminPermNote')}
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
