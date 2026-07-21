'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import Loading from '@/components/Loading';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
  { href: '/admin/users', label: 'ניהול משתמשים' },
];

interface AllowedEmail { id: number; email: string }
interface User { id: number; name: string; email: string; isAdmin: boolean }

export default function AdminUsersClient({ myUserId }: { myUserId: number }) {
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [emailsRes, usersRes] = await Promise.all([
      fetch('/api/admin/allowed-emails'),
      fetch('/api/admin/users'),
    ]);
    if (emailsRes.ok) setEmails((await emailsRes.json()).emails);
    if (usersRes.ok) setUsers((await usersRes.json()).users);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addEmail(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/allowed-emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: newEmail }),
    });
    if (res.ok) {
      setNewEmail('');
      await load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? 'שגיאה');
    }
  }

  async function removeEmail(email: string) {
    await fetch('/api/admin/allowed-emails', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    await load();
  }

  async function toggleAdmin(user: User) {
    setError('');
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: user.id, isAdmin: !user.isAdmin }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'שגיאה');
    }
    await load();
  }

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-3xl mx-auto p-4 space-y-8">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loading ? (
          <Loading />
        ) : (
          <>
            <section>
              <h2 className="font-bold mb-2">מיילים מורשים להרשמה</h2>
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
                  הוסף
                </button>
              </form>
              {emails.length === 0 ? (
                <p className="text-gray-500 text-sm">אין מיילים ברשימה. רק מייל שנוסף כאן יוכל להירשם.</p>
              ) : (
                <ul className="bg-white rounded-lg shadow-sm divide-y">
                  {emails.map(e => (
                    <li key={e.id} className="flex items-center justify-between px-3 py-2">
                      <span dir="ltr">{e.email}</span>
                      <button onClick={() => removeEmail(e.email)} className="text-red-600 text-sm hover:underline">
                        הסר
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="font-bold mb-2">משתמשים רשומים</h2>
              <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-100 text-start">שם</th>
                    <th className="border p-2 bg-gray-100 text-start">מייל</th>
                    <th className="border p-2 bg-gray-100">מנהל</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="border p-2">{u.name}{u.id === myUserId && ' (אני)'}</td>
                      <td className="border p-2" dir="ltr">{u.email}</td>
                      <td className="border p-2 text-center">
                        <input
                          type="checkbox"
                          checked={u.isAdmin}
                          disabled={u.id === myUserId}
                          onChange={() => toggleAdmin(u)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">
                הרשאת מנהל נכנסת לתוקף בכניסה הבאה של המשתמש. לא ניתן לשנות את ההרשאה של עצמך.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
