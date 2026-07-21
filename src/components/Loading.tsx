'use client';

import { useT } from '@/lib/i18n';

export default function Loading() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-brand-100" />
        <span className="absolute inset-0 animate-ring-spin rounded-full border-2 border-transparent border-t-brand-500" />
        <img
          src="/logo.png"
          alt="HP Indigo"
          className="h-11 w-auto animate-logo-breathe rounded-lg"
        />
      </div>
      <span className="text-sm font-medium text-slate-500">{t('loading')}</span>
    </div>
  );
}
