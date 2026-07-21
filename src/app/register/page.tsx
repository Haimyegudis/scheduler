import Link from 'next/link';
import AuthForm from '@/components/AuthForm';

export default function RegisterPage() {
  return (
    <AuthForm
      title="הרשמה"
      endpoint="/api/auth/register"
      redirectTo="/"
      fields={[
        { name: 'name', label: 'שם מלא', type: 'text', autoComplete: 'name' },
        { name: 'email', label: 'אימייל', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'סיסמה (8 תווים לפחות)', type: 'password', minLength: 8, autoComplete: 'new-password' },
      ]}
      footer={
        <>
          <p className="mb-1 text-xs text-gray-400">ההרשמה פתוחה רק למיילים שאושרו על ידי המנהל.</p>
          כבר רשום? <Link href="/login" className="text-blue-600 hover:underline">להתחברות</Link>
        </>
      }
    />
  );
}
