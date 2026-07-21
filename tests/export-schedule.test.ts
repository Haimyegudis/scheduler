import { test, expect } from 'vitest';
import { buildScheduleHtmlTable, buildScheduleText, type ScheduleExportDay, type ScheduleExportRow } from '@/lib/exportSchedule';

const days: ScheduleExportDay[] = [
  { date: '2026-07-19', label: 'Sunday 19.7' },
  { date: '2026-07-20', label: 'Monday 20.7' },
];

const rows: ScheduleExportRow[] = [
  {
    label: 'Morning · Station A',
    cells: {
      '2026-07-19': { technicianName: 'Dana', experimenter: 'Dr. Cohen', note: 'urgent' },
      '2026-07-20': undefined,
    },
  },
  {
    label: 'Evening · Station A',
    cells: {
      '2026-07-19': { color: 'blue' },
      '2026-07-20': { technicianName: 'Avi', color: 'green' },
    },
  },
];

test('html table includes header row and day labels', () => {
  const html = buildScheduleHtmlTable('Shift / Station', days, rows);
  expect(html).toContain('<table');
  expect(html).toContain('Shift / Station');
  expect(html).toContain('Sunday 19.7');
  expect(html).toContain('Monday 20.7');
  expect(html).toContain('Morning · Station A');
});

test('html cell joins technician, experimenter and note', () => {
  const html = buildScheduleHtmlTable('H', days, rows);
  expect(html).toContain('Dana / Dr. Cohen / urgent');
});

test('html empty cell gets light-red inline background and no text', () => {
  const html = buildScheduleHtmlTable('H', days, rows);
  // The Monday cell of the first row is undefined -> empty, light red background
  const emptyCellMatch = html.match(/<td style="[^"]*background:#fef2f2;">\s*<\/td>/);
  expect(emptyCellMatch).not.toBeNull();
});

test('html colored cell uses the preset hex background instead of empty styling', () => {
  const html = buildScheduleHtmlTable('H', days, rows);
  expect(html).toContain('background:#bfdbfe;'); // blue, no text
  expect(html).toContain('background:#bbf7d0;">Avi</td>'); // green with technician name
});

test('escapes HTML-sensitive characters', () => {
  const html = buildScheduleHtmlTable('<script>', days, [
    { label: 'x', cells: { '2026-07-19': { technicianName: '<b>Bad</b>' } } },
  ]);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>Bad</b>');
  expect(html).toContain('&lt;script&gt;');
});

test('plain-text export is tab/newline separated and matches cell content', () => {
  const text = buildScheduleText('Shift / Station', days, rows);
  const lines = text.split('\n');
  expect(lines[0]).toBe('Shift / Station\tSunday 19.7\tMonday 20.7');
  expect(lines[1]).toBe('Morning · Station A\tDana / Dr. Cohen / urgent\t');
  expect(lines[2]).toBe('Evening · Station A\t\tAvi');
});
