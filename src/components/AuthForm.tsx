'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT, translateApiError, LangToggle } from '@/lib/i18n';

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
  const { t, lang } = useT();
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
      setError(data.error ? translateApiError(lang, data.error) : t('unexpectedError'));
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex">
        <div aria-hidden className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute end-0 bottom-0 h-96 w-96 translate-y-1/3 rounded-full bg-brand-300/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src="/logo.png" alt="HP Indigo" className="h-11 w-auto rounded-xl bg-white/95 p-1.5 shadow-lg" />
          <span className="text-lg font-bold tracking-tight">{t('appTitle')}</span>
        </div>
        <div className="relative max-w-sm">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">{t('appTitle')}</h2>
          <p className="mt-4 text-sm leading-relaxed text-brand-50/80">HP Indigo</p>
        </div>
        <div className="relative text-xs text-brand-100/60">HP Indigo © {new Date().getFullYear()}</div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <form onSubmit={submit} className="surface-card animate-fade-up w-full max-w-sm space-y-5 p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <img src="/logo.png" alt="HP Indigo" className="h-9 w-auto rounded-lg lg:hidden" />
            <LangToggle className="ms-auto shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2" />
          </div>
          <div className="text-center lg:text-start">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('appTitle')}</p>
          </div>
          {fields.map(f => (
            <label key={f.name} className="block">
              <span className="text-sm font-medium text-slate-700">{f.label}</span>
              <input
                type={f.type}
                name={f.name}
                id={`auth-${f.name}`}
                required
                minLength={f.minLength}
                value={values[f.name] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                className="field mt-1.5"
                dir={f.type === 'email' ? 'ltr' : undefined}
                autoComplete={f.autoComplete}
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy && <span className="h-4 w-4 animate-ring-spin rounded-full border-2 border-white/40 border-t-white" />}
            {title}
          </button>
          {footer && <div className="text-center text-sm text-slate-500">{footer}</div>}
        </form>
      </div>
    </main>
  );
}

export { Link };
