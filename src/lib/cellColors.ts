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

// Automatic, consistent per-press identifying tint, cycled by station position (0-based).
// Reuses the same 8 hues as the admin preset palette above, but at much lighter shades
// (50/100 instead of 200) so admin-applied cell colors always read as visually dominant.

// Press-name row-label cell tint. Paired with the app's existing slate text colors, which
// keep AA contrast against these very light backgrounds regardless of hue.
const PRESS_LABEL_CLASSES: Record<ColorToken, string> = {
  red: 'bg-red-100',
  orange: 'bg-orange-100',
  yellow: 'bg-yellow-100',
  green: 'bg-green-100',
  teal: 'bg-teal-100',
  blue: 'bg-blue-100',
  purple: 'bg-purple-100',
  pink: 'bg-pink-100',
};

// Even fainter tint usable as a row/data-cell background fallback.
const PRESS_ROW_CLASSES: Record<ColorToken, string> = {
  red: 'bg-red-50',
  orange: 'bg-orange-50',
  yellow: 'bg-yellow-50',
  green: 'bg-green-50',
  teal: 'bg-teal-50',
  blue: 'bg-blue-50',
  purple: 'bg-purple-50',
  pink: 'bg-pink-50',
};

// Inline hex for the press-label cell in the Outlook copy export.
const PRESS_LABEL_HEX: Record<ColorToken, string> = {
  red: '#fee2e2',
  orange: '#ffedd5',
  yellow: '#fef9c3',
  green: '#dcfce7',
  teal: '#ccfbf1',
  blue: '#dbeafe',
  purple: '#f3e8ff',
  pink: '#fce7f3',
};

export function pressHue(position: number): ColorToken {
  return COLOR_TOKENS[((position % COLOR_TOKENS.length) + COLOR_TOKENS.length) % COLOR_TOKENS.length];
}

export function pressLabelClass(position: number): string {
  return PRESS_LABEL_CLASSES[pressHue(position)];
}

export function pressRowClass(position: number): string {
  return PRESS_ROW_CLASSES[pressHue(position)];
}

export function pressLabelHex(position: number): string {
  return PRESS_LABEL_HEX[pressHue(position)];
}
