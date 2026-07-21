'use client';

import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { useT } from '@/lib/i18n';

export default function LoginPage() {
  const { t } = useT();
  return (
    <AuthForm
      title={t('loginTitle')}
      endpoint="/api/auth/login"
      redirectTo="/"
      fields={[
        { name: 'email', label: t('emailLabel'), type: 'email', autoComplete: 'email' },
        { name: 'password', label: t('passwordLabel'), type: 'password', autoComplete: 'current-password' },
      ]}
      footer={
        <>
          {t('noAccount')} <Link href="/register" className="text-blue-600 hover:underline">{t('toRegister')}</Link>
        </>
      }
    />
  );
}
