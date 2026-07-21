import type { Lang } from './i18n';

const CONSTRAINT_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    morning: 'בוקר',
    evening: 'ערב',
    flex: 'גמיש',
    off: 'חופש',
  },
  en: {
    morning: 'Morning',
    evening: 'Evening',
    flex: 'Flexible',
    off: 'Day off',
  },
};

export const CONSTRAINT_COLORS: Record<string, string> = {
  morning: 'bg-amber-100 text-amber-800',
  evening: 'bg-indigo-100 text-indigo-800',
  flex: 'bg-green-100 text-green-800',
  off: 'bg-gray-200 text-gray-600',
};

const SHIFT_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    morning: 'בוקר',
    evening: 'ערב',
  },
  en: {
    morning: 'Morning',
    evening: 'Evening',
  },
};

const STATUS_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    full: 'מילא הכל',
    partial: 'מילא חלקית',
    none: 'לא מילא',
  },
  en: {
    full: 'Fully submitted',
    partial: 'Partially submitted',
    none: 'Not submitted',
  },
};

const ABSENCE_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    vacation: 'חופשה',
    sick: 'מחלה',
    miluim: 'מילואים',
    other: 'אחר',
  },
  en: {
    vacation: 'Vacation',
    sick: 'Sick',
    miluim: 'Miluim (reserve duty)',
    other: 'Other',
  },
};

const DAY_NAMES: Record<Lang, string[]> = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

export function dayNameByIndex(lang: Lang, index: number): string {
  return DAY_NAMES[lang][index];
}

export const ABSENCE_COLORS: Record<string, string> = {
  vacation: 'bg-purple-100 text-purple-800',
  sick: 'bg-rose-100 text-rose-800',
  miluim: 'bg-teal-100 text-teal-800',
  other: 'bg-gray-200 text-gray-700',
};

export function constraintLabel(lang: Lang, value: string): string {
  return CONSTRAINT_LABELS[lang][value] ?? value;
}

export function shiftLabel(lang: Lang, value: string): string {
  return SHIFT_LABELS[lang][value] ?? value;
}

export function statusLabel(lang: Lang, value: string): string {
  return STATUS_LABELS[lang][value] ?? value;
}

export function absenceLabel(lang: Lang, value: string): string {
  return ABSENCE_LABELS[lang][value] ?? value;
}

export function absenceEntries(lang: Lang): Array<[string, string]> {
  return Object.entries(ABSENCE_LABELS[lang]);
}
