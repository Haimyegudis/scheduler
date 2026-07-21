'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useT, LangToggle } from '@/lib/i18n';
import NotificationBell from '@/components/NotificationBell';

export default function NavBar({
  name,
  links,
}: {
  name: string;
  links: Array<{ href: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2.5 font-bold text-slate-900">
          <img src="/logo.png" alt="HP Indigo" className="h-8 w-auto rounded-lg shadow-sm" />
          <span className="hidden sm:inline">{t('appTitle')}</span>
        </span>
        <nav className="flex flex-wrap items-center gap-1">
          {links.map(l => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'nav-link-active' : 'nav-link'}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-3 text-sm">
          <NotificationBell />
          <span className="hidden text-slate-500 md:inline">
            {t('hello')} <span className="font-medium text-slate-700">{name}</span>
          </span>
          <button onClick={logout} className="link-danger text-sm">
            {t('logout')}
          </button>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
