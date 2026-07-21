import { test, expect } from 'vitest';
import {
  daysBetweenInclusive,
  clipToRange,
  emptyAbsenceCounts,
  addAbsenceToCounts,
  totalOf,
} from '@/lib/vacationDays';

test('daysBetweenInclusive counts both endpoints', () => {
  expect(daysBetweenInclusive('2026-01-01', '2026-01-01')).toBe(1);
  expect(daysBetweenInclusive('2026-01-01', '2026-01-03')).toBe(3);
});

test('clipToRange clips start/end into [from, to] and returns null when no overlap', () => {
  expect(clipToRange('2026-01-05', '2026-01-10', '2026-01-01', '2026-01-31')).toEqual({
    start: '2026-01-05',
    end: '2026-01-10',
  });
  expect(clipToRange('2025-12-25', '2026-01-05', '2026-01-01', '2026-01-31')).toEqual({
    start: '2026-01-01',
    end: '2026-01-05',
  });
  expect(clipToRange('2026-01-25', '2026-02-05', '2026-01-01', '2026-01-31')).toEqual({
    start: '2026-01-25',
    end: '2026-01-31',
  });
  expect(clipToRange('2025-01-01', '2025-12-31', '2026-01-01', '2026-01-31')).toBeNull();
});

test('addAbsenceToCounts accumulates clipped day counts by type, unknown types fall into other', () => {
  const counts = emptyAbsenceCounts();
  addAbsenceToCounts(counts, { startDate: '2026-01-05', endDate: '2026-01-07', type: 'vacation' }, '2026-01-01', '2026-01-31');
  addAbsenceToCounts(counts, { startDate: '2026-01-28', endDate: '2026-02-05', type: 'sick' }, '2026-01-01', '2026-01-31');
  addAbsenceToCounts(counts, { startDate: '2026-01-10', endDate: '2026-01-10', type: 'weird' }, '2026-01-01', '2026-01-31');
  expect(counts).toEqual({ vacation: 3, sick: 4, miluim: 0, other: 1 });
  expect(totalOf(counts)).toBe(8);
});

test('addAbsenceToCounts ignores absences fully outside the range', () => {
  const counts = emptyAbsenceCounts();
  addAbsenceToCounts(counts, { startDate: '2025-01-01', endDate: '2025-12-31', type: 'vacation' }, '2026-01-01', '2026-01-31');
  expect(counts).toEqual({ vacation: 0, sick: 0, miluim: 0, other: 0 });
});
