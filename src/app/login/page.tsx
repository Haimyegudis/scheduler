import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <AuthForm
      title="התחברות"
      endpoint="/api/auth/login"
      redirectTo="/"
      fields={[
        { name: 'email', label: 'אימייל', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'סיסמה', type: 'password', autoComplete: 'current-password' },
      ]}
      footer={
        <>
          אין לך חשבון? <Link href="/register" className="text-blue-600 hover:underline">להרשמה</Link>
        </>
      }
    />
  );
}
