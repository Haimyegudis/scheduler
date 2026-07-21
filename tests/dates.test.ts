import { test, expect } from 'vitest';
import { weekStartOf, addDays, weekDates, dayName, formatDate, getCurrentWeekStart } from '@/lib/dates';

test('weekStartOf returns the Sunday of the week', () => {
  expect(weekStartOf('2026-07-21')).toBe('2026-07-19'); // Tuesday -> Sunday
  expect(weekStartOf('2026-07-19')).toBe('2026-07-19'); // Sunday -> itself
  expect(weekStartOf('2026-07-25')).toBe('2026-07-19'); // Saturday -> same week Sunday
});

test('addDays crosses month boundaries', () => {
  expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  expect(addDays('2026-07-19', 7)).toBe('2026-07-26');
  expect(addDays('2026-07-19', -7)).toBe('2026-07-12');
});

test('weekDates returns Sun-Thu, plus Friday when enabled', () => {
  expect(weekDates('2026-07-19', false)).toEqual([
    '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
  ]);
  expect(weekDates('2026-07-19', true)).toHaveLength(6);
  expect(weekDates('2026-07-19', true)[5]).toBe('2026-07-24');
});

test('dayName and formatDate', () => {
  expect(dayName('2026-07-19')).toBe('ראשון');
  expect(dayName('2026-07-24')).toBe('שישי');
  expect(formatDate('2026-07-19')).toBe('19.7');
});

test('getCurrentWeekStart uses provided date', () => {
  expect(getCurrentWeekStart(new Date(Date.UTC(2026, 6, 21)))).toBe('2026-07-19');
});
