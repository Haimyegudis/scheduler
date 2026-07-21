const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekStartOf(date: string): string {
  return addDays(date, -toDate(date).getUTCDay());
}

export function weekDates(weekStart: string, includeFriday: boolean): string[] {
  const count = includeFriday ? 6 : 5;
  return Array.from({ length: count }, (_, i) => addDays(weekStart, i));
}

export function getCurrentWeekStart(now: Date = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return weekStartOf(iso);
}

export function dayName(date: string): string {
  return HEBREW_DAYS[toDate(date).getUTCDay()];
}

export function formatDate(date: string): string {
  const d = toDate(date);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}
