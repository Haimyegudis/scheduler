'use client';

import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { useT } from '@/lib/i18n';

export default function RegisterPage() {
  const { t } = useT();
  return (
    <AuthForm
      title={t('registerTitle')}
      endpoint="/api/auth/register"
      redirectTo="/"
      fields={[
        { name: 'name', label: t('fullNameLabel'), type: 'text', autoComplete: 'name' },
        { name: 'email', label: t('emailLabel'), type: 'email', autoComplete: 'email' },
        { name: 'password', label: t('passwordMinLabel'), type: 'password', minLength: 8, autoComplete: 'new-password' },
      ]}
      footer={
        <>
          <p className="mb-1 text-xs text-gray-400">{t('registerRestrictedNote')}</p>
          {t('alreadyRegistered')} <Link href="/login" className="text-blue-600 hover:underline">{t('toLogin')}</Link>
        </>
      }
    />
  );
}
