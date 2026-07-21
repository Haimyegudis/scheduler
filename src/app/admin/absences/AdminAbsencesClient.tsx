'use client';

import { useCallback, useEffect, useState } from 'react';
import NavBar from '@/components/NavBar';
import { ABSENCE_LABELS, ABSENCE_COLORS } from '@/lib/labels';
import { formatDate } from '@/lib/dates';

const ADMIN_LINKS = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/schedule', label: 'תוכנית משמרות' },
  { href: '/admin/users', label: 'ניהול משתמשים' },
  { href: '/admin/absences', label: 'היעדרויות' },
  { href: '/admin/reports', label: 'דוחות' },
];

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
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [form, setForm] = useState({ technicianId: '', type: 'vacation', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [absRes, usersRes] = await Promise.all([
      fetch('/api/admin/absences'),
      fetch('/api/admin/users'),
    ]);
    if (absRes.ok) setAbsences((await absRes.json()).absences);
    if (usersRes.ok) {
      const users = (await usersRes.json()).users as Array<Tech & { isAdmin: boolean }>;
      setTechs(users.filter(u => !u.isAdmin));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
      setError((await res.json().catch(() => ({}))).error ?? 'שגיאה');
    }
  }

  async function remove(id: number) {
    await fetch('/api/admin/absences', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div>
      <NavBar name="מנהל" links={ADMIN_LINKS} />
      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <section>
          <h2 className="font-bold mb-2">הוספת היעדרות</h2>
          <form onSubmit={add} className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              עובד
              <select
                required
                value={form.technicianId}
                onChange={e => setForm(f => ({ ...f, technicianId: e.target.value }))}
                className="block mt-1 border rounded px-2 py-1.5 min-w-36"
              >
                <option value="">בחר עובד</option>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              סוג
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="block mt-1 border rounded px-2 py-1.5"
              >
                {Object.entries(ABSENCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              מתאריך
              <input
                type="date"
                required
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="block mt-1 border rounded px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              עד תאריך (כולל)
              <input
                type="date"
                required
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="block mt-1 border rounded px-2 py-1.5"
              />
            </label>
            <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
              הוסף
            </button>
          </form>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </section>
        <section>
          <h2 className="font-bold mb-2">היעדרויות</h2>
          {loading ? (
            <p className="text-center text-gray-500 py-8">טוען...</p>
          ) : absences.length === 0 ? (
            <p className="text-gray-500 text-sm">אין היעדרויות.</p>
          ) : (
            <table className="w-full bg-white rounded-lg shadow-sm text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 bg-gray-100 text-start">עובד</th>
                  <th className="border p-2 bg-gray-100">סוג</th>
                  <th className="border p-2 bg-gray-100">מתאריך</th>
                  <th className="border p-2 bg-gray-100">עד תאריך</th>
                  <th className="border p-2 bg-gray-100"></th>
                </tr>
              </thead>
              <tbody>
                {absences.map(a => (
                  <tr key={a.id}>
                    <td className="border p-2">{a.technicianName}</td>
                    <td className="border p-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${ABSENCE_COLORS[a.type]}`}>
                        {ABSENCE_LABELS[a.type]}
                      </span>
                    </td>
                    <td className="border p-2 text-center">{formatDate(a.startDate)}</td>
                    <td className="border p-2 text-center">{formatDate(a.endDate)}</td>
                    <td className="border p-2 text-center">
                      <button onClick={() => remove(a.id)} className="text-red-600 hover:underline">
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
