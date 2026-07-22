import { test, expect } from 'vitest';
import { buildScheduleHtmlTable, buildScheduleText, type ScheduleExportDay, type ScheduleExportGroup } from '@/lib/exportSchedule';

const days: ScheduleExportDay[] = [
  { date: '2026-07-19', label: 'Sunday 19.7' },
  { date: '2026-07-20', label: 'Monday 20.7' },
];

// Two presses, each with a morning row followed directly by its evening row (grouped by
// press, not by shift) — this is the order the board and technician table now render in.
const groups: ScheduleExportGroup[] = [
  {
    pressLabel: 'Press A',
    pressColorHex: '#fee2e2',
    shifts: [
      {
        shiftLabel: 'Morning',
        cells: {
          '2026-07-19': { technicianName: 'Dana', experimenter: 'Dr. Cohen', note: 'urgent' },
          '2026-07-20': undefined,
        },
      },
      {
        shiftLabel: 'Evening',
        cells: {
          '2026-07-19': { color: 'blue' },
          '2026-07-20': { technicianName: 'Avi', color: 'green' },
        },
      },
    ],
  },
  {
    pressLabel: 'Press B',
    pressColorHex: '#ffedd5',
    shifts: [
      { shiftLabel: 'Morning', cells: { '2026-07-19': { technicianName: 'Roni' } } },
      { shiftLabel: 'Evening', cells: { '2026-07-19': { technicianName: 'Tal' } } },
    ],
  },
];

test('html table includes header row and day labels', () => {
  const html = buildScheduleHtmlTable('Shift / Press', days, groups);
  expect(html).toContain('<table');
  expect(html).toContain('Shift / Press');
  expect(html).toContain('Sunday 19.7');
  expect(html).toContain('Monday 20.7');
  expect(html).toContain('Press A');
});

test('html groups rows by press: each press shows morning then evening consecutively', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  const pressAIndex = html.indexOf('Press A');
  const pressAMorningIndex = html.indexOf('Morning', pressAIndex);
  const pressAEveningIndex = html.indexOf('Evening', pressAIndex);
  const pressBIndex = html.indexOf('Press B');
  // Press A's morning and evening rows both come before Press B's rows.
  expect(pressAMorningIndex).toBeGreaterThan(-1);
  expect(pressAEveningIndex).toBeGreaterThan(pressAMorningIndex);
  expect(pressBIndex).toBeGreaterThan(pressAEveningIndex);
});

test('html press-name cell uses rowspan to show the press once for both shifts', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  expect(html).toContain('<td rowspan="2"');
  // Only one rowspan cell per press — the label is not repeated on the evening row.
  expect(html.match(/>Press A</g)).toHaveLength(1);
  expect(html.match(/>Press B</g)).toHaveLength(1);
});

test('html press-name cell carries the faint per-press tint background', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  expect(html).toContain('background:#fee2e2;">Press A</td>');
  expect(html).toContain('background:#ffedd5;">Press B</td>');
});

test('html cell joins technician, experimenter and note', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  expect(html).toContain('Dana / Dr. Cohen / urgent');
});

test('html empty cell gets light-red inline background and no text', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  // The Monday cell of Press A's morning row is undefined -> empty, light red background
  const emptyCellMatch = html.match(/<td style="[^"]*background:#fef2f2;">\s*<\/td>/);
  expect(emptyCellMatch).not.toBeNull();
});

test('html colored cell uses the preset hex background instead of empty styling', () => {
  const html = buildScheduleHtmlTable('H', days, groups);
  expect(html).toContain('background:#bfdbfe;'); // blue, no text
  expect(html).toContain('background:#bbf7d0;">Avi</td>'); // green with technician name
});

test('escapes HTML-sensitive characters', () => {
  const html = buildScheduleHtmlTable('<script>', days, [
    { pressLabel: '<b>Bad</b>', shifts: [{ shiftLabel: 'x', cells: { '2026-07-19': { technicianName: '<b>Bad</b>' } } }] },
  ]);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>Bad</b>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;b&gt;Bad&lt;/b&gt;');
});

test('plain-text export is tab/newline separated, grouped by press, label shown once per group', () => {
  const text = buildScheduleText('Shift / Press', days, groups);
  const lines = text.split('\n');
  expect(lines[0]).toBe('Shift / Press\t\tSunday 19.7\tMonday 20.7');
  expect(lines[1]).toBe('Press A\tMorning\tDana / Dr. Cohen / urgent\t');
  expect(lines[2]).toBe('\tEvening\t\tAvi');
  expect(lines[3]).toBe('Press B\tMorning\tRoni\t');
  expect(lines[4]).toBe('\tEvening\tTal\t');
});
