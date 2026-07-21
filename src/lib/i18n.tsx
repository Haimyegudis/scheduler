'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { dict, type DictKey, type Lang } from './i18n-dict';

export { tFor, translateApiError } from './i18n-dict';
export type { DictKey, Lang } from './i18n-dict';

interface I18nContextValue {
  lang: Lang;
  t: (key: DictKey) => string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `lang=${next}; path=/; max-age=31536000`;
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const t = useCallback((key: DictKey) => dict[lang][key] ?? dict.he[key] ?? key, [lang]);

  return <I18nContext.Provider value={{ lang, t, setLang }}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within an I18nProvider');
  return ctx;
}

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
      aria-label="Toggle language"
      className={
        className ??
        'shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2'
      }
    >
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  );
}
