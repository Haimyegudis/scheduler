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
      className={className ?? 'text-sm border rounded px-2 py-1 hover:bg-gray-100 shrink-0'}
    >
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  );
}
