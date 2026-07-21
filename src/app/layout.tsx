import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';
import { tFor, type Lang } from '@/lib/i18n-dict';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

const heebo = Heebo({
  subsets: ['latin', 'hebrew'],
  variable: '--font-heebo',
  display: 'swap',
});

async function getLang(): Promise<Lang> {
  const value = (await cookies()).get('lang')?.value;
  return value === 'he' ? 'he' : 'en';
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tFor(lang, 'metaTitle'),
    icons: { icon: '/logo.png' },
    manifest: '/manifest.json',
  };
}

export const viewport = {
  themeColor: '#0aa8dc',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} className={heebo.variable}>
      <body className="min-h-screen text-slate-900">
        <I18nProvider initialLang={lang}>
          <ServiceWorkerRegister />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
