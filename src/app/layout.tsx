import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { I18nProvider, tFor, type Lang } from '@/lib/i18n';

async function getLang(): Promise<Lang> {
  const value = (await cookies()).get('lang')?.value;
  return value === 'en' ? 'en' : 'he';
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tFor(lang, 'metaTitle'),
    icons: { icon: '/logo.png' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
