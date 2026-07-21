// Builds the HTML/plain-text table used by the admin board's "Copy schedule" button, so it can
// be written to the clipboard and pasted into Outlook (or any rich-text-aware target) as a table.

import { colorHex } from './cellColors';

export interface ScheduleExportDay {
  date: string;
  label: string;
}

export interface ScheduleExportCell {
  technicianName?: string | null;
  experimenter?: string | null;
  note?: string | null;
  color?: string | null;
}

export interface ScheduleExportRow {
  label: string;
  cells: Record<string, ScheduleExportCell | undefined>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellText(cell?: ScheduleExportCell): string {
  return [cell?.technicianName, cell?.experimenter, cell?.note]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' / ');
}

function isCellEmpty(cell?: ScheduleExportCell): boolean {
  return !cell || (!cell.technicianName && !cell.experimenter && !cell.note);
}

const TH_STYLE = 'border:1px solid #ccc;padding:4px 8px;background:#f3f4f6;font-family:sans-serif;font-size:12px;';
const TD_STYLE = 'border:1px solid #ccc;padding:4px 8px;font-family:sans-serif;font-size:12px;text-align:center;';
const EMPTY_BG = 'background:#fef2f2;';

export function buildScheduleHtmlTable(
  headerLabel: string,
  days: ScheduleExportDay[],
  rows: ScheduleExportRow[]
): string {
  let html = '<table style="border-collapse:collapse;">';
  html += `<tr><th style="${TH_STYLE}">${escapeHtml(headerLabel)}</th>`;
  for (const d of days) html += `<th style="${TH_STYLE}">${escapeHtml(d.label)}</th>`;
  html += '</tr>';
  for (const row of rows) {
    html += `<tr><td style="${TH_STYLE}">${escapeHtml(row.label)}</td>`;
    for (const d of days) {
      const cell = row.cells[d.date];
      const hex = colorHex(cell?.color);
      const bg = hex ? `background:${hex};` : isCellEmpty(cell) ? EMPTY_BG : '';
      html += `<td style="${TD_STYLE}${bg}">${escapeHtml(cellText(cell))}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

export function buildScheduleText(headerLabel: string, days: ScheduleExportDay[], rows: ScheduleExportRow[]): string {
  const lines = [[headerLabel, ...days.map(d => d.label)].join('\t')];
  for (const row of rows) {
    lines.push([row.label, ...days.map(d => cellText(row.cells[d.date]))].join('\t'));
  }
  return lines.join('\n');
}
