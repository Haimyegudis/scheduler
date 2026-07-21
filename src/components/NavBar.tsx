'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useT, LangToggle } from '@/lib/i18n';

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
    <header className="bg-white border-b px-4 py-3 flex items-center gap-4 flex-wrap">
      <span className="flex items-center gap-2 font-bold">
        <img src="/logo.png" alt="HP Indigo" className="h-8 w-auto rounded" />
        {t('appTitle')}
      </span>
      <nav className="flex gap-3">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-2 py-1 rounded ${pathname === l.href ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ms-auto flex items-center gap-3 text-sm">
        <span className="text-gray-500">{t('hello')} {name}</span>
        <button onClick={logout} className="text-red-600 hover:underline">{t('logout')}</button>
        <LangToggle />
      </div>
    </header>
  );
}
