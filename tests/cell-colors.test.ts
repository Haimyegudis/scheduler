import { test, expect } from 'vitest';
import { isValidCellColor, isColorToken, colorClass, colorHex, COLOR_TOKENS } from '@/lib/cellColors';

test('all preset tokens are valid colors with a class and hex value', () => {
  for (const token of COLOR_TOKENS) {
    expect(isColorToken(token)).toBe(true);
    expect(isValidCellColor(token)).toBe(true);
    expect(colorClass(token)).toMatch(/^bg-/);
    expect(colorHex(token)).toMatch(/^#[0-9a-f]{6}$/);
  }
});

test('null and undefined are valid (clears/absent color)', () => {
  expect(isValidCellColor(null)).toBe(true);
  expect(isValidCellColor(undefined)).toBe(true);
  expect(colorClass(null)).toBe('');
  expect(colorHex(undefined)).toBeNull();
});

test('unknown strings are rejected', () => {
  expect(isValidCellColor('magenta')).toBe(false);
  expect(isValidCellColor('bg-red-200')).toBe(false);
  expect(isValidCellColor(5)).toBe(false);
  expect(isColorToken('')).toBe(false);
});
