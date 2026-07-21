// Shared preset palette for board cell highlighting.
// Used by the admin board UI (Tailwind classes), the technician published view,
// the Outlook copy export (inline hex), and server-side save validation.

export const COLOR_TOKENS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

// Tailwind-safe literal class names (must appear verbatim in source for the JIT scanner).
export const COLOR_CLASSES: Record<ColorToken, string> = {
  red: 'bg-red-200',
  orange: 'bg-orange-200',
  yellow: 'bg-yellow-200',
  green: 'bg-green-200',
  teal: 'bg-teal-200',
  blue: 'bg-blue-200',
  purple: 'bg-purple-200',
  pink: 'bg-pink-200',
};

// Inline hex values for contexts that can't use Tailwind (e.g. copied Outlook HTML).
export const COLOR_HEX: Record<ColorToken, string> = {
  red: '#fecaca',
  orange: '#fed7aa',
  yellow: '#fef08a',
  green: '#bbf7d0',
  teal: '#99f6e4',
  blue: '#bfdbfe',
  purple: '#e9d5ff',
  pink: '#fbcfe8',
};

const TOKEN_SET: ReadonlySet<string> = new Set(COLOR_TOKENS);

export function isColorToken(value: unknown): value is ColorToken {
  return typeof value === 'string' && TOKEN_SET.has(value);
}

/** Validates a color field for the schedule-save payload: must be a known preset token, null, or undefined. */
export function isValidCellColor(value: unknown): value is ColorToken | null | undefined {
  return value === null || value === undefined || isColorToken(value);
}

export function colorClass(token: string | null | undefined): string {
  return isColorToken(token) ? COLOR_CLASSES[token] : '';
}

export function colorHex(token: string | null | undefined): string | null {
  return isColorToken(token) ? COLOR_HEX[token] : null;
}
