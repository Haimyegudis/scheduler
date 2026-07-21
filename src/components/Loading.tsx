'use client';

import { useT } from '@/lib/i18n';

export default function Loading() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <img src="/logo.png" alt="HP Indigo" className="h-16 w-auto rounded-lg animate-pulse" />
      <span className="text-gray-500 text-sm">{t('loading')}</span>
    </div>
  );
}
