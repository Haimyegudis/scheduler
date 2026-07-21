// Shared day-counting/clipping logic for absence summaries (admin vacation-summary
// report and technician "My Vacations" page).

export interface AbsenceTypeCounts {
  vacation: number;
  sick: number;
  miluim: number;
  other: number;
}

export function daysBetweenInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

/** Clips [start, end] into [from, to]; returns null when there is no overlap. */
export function clipToRange(
  start: string,
  end: string,
  from: string,
  to: string
): { start: string; end: string } | null {
  const clippedStart = start > from ? start : from;
  const clippedEnd = end < to ? end : to;
  if (clippedStart > clippedEnd) return null;
  return { start: clippedStart, end: clippedEnd };
}

export function emptyAbsenceCounts(): AbsenceTypeCounts {
  return { vacation: 0, sick: 0, miluim: 0, other: 0 };
}

/** Clips the absence into [from, to] and adds its inclusive day count to the matching type bucket. */
export function addAbsenceToCounts(
  counts: AbsenceTypeCounts,
  absence: { startDate: string; endDate: string; type: string },
  from: string,
  to: string
): void {
  const clipped = clipToRange(absence.startDate, absence.endDate, from, to);
  if (!clipped) return;
  const key = (absence.type in counts ? absence.type : 'other') as keyof AbsenceTypeCounts;
  counts[key] += daysBetweenInclusive(clipped.start, clipped.end);
}

export function totalOf(counts: AbsenceTypeCounts): number {
  return counts.vacation + counts.sick + counts.miluim + counts.other;
}
