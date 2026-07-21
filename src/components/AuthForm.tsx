'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface Field {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  minLength?: number;
  autoComplete?: string;
}

export default function AuthForm({
  title,
  fields,
  endpoint,
  redirectTo,
  footer,
}: {
  title: string;
  fields: Field[];
  endpoint: string;
  redirectTo: string;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setBusy(false);
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'שגיאה לא צפויה');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-6 w-full max-w-sm space-y-4">
        <img src="/logo.png" alt="HP Indigo" className="h-16 w-auto rounded-lg mx-auto" />
        <h1 className="text-xl font-bold text-center">{title}</h1>
        {fields.map(f => (
          <label key={f.name} className="block">
            <span className="text-sm text-gray-600">{f.label}</span>
            <input
              type={f.type}
              name={f.name}
              id={`auth-${f.name}`}
              required
              minLength={f.minLength}
              value={values[f.name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
              className="mt-1 w-full border rounded px-3 py-2"
              dir={f.type === 'email' ? 'ltr' : undefined}
              autoComplete={f.autoComplete}
            />
          </label>
        ))}
        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '...' : title}
        </button>
        {footer && <div className="text-sm text-center text-gray-600">{footer}</div>}
      </form>
    </main>
  );
}

export { Link };
