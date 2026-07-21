export type ConstraintValue = 'morning' | 'evening' | 'flex' | 'off';
export type Shift = 'morning' | 'evening';

export interface TechAvailability {
  technicianId: number;
  constraints: Record<string, ConstraintValue>;
}

export interface GeneratedAssignment {
  date: string;
  shift: Shift;
  station: number;
  technicianId: number;
}

const STATIONS = 4;

export function generateAssignments(
  dates: string[],
  techs: TechAvailability[]
): GeneratedAssignment[] {
  const totalShifts = new Map<number, number>();
  const shiftTypeCounts: Record<Shift, Map<number, number>> = {
    morning: new Map(),
    evening: new Map(),
  };
  for (const t of techs) {
    totalShifts.set(t.technicianId, 0);
    shiftTypeCounts.morning.set(t.technicianId, 0);
    shiftTypeCounts.evening.set(t.technicianId, 0);
  }

  const result: GeneratedAssignment[] = [];

  for (const date of dates) {
    const usedToday = new Set<number>();

    for (const shift of ['morning', 'evening'] as Shift[]) {
      const available = techs.filter(t => {
        const c = t.constraints[date];
        return (c === shift || c === 'flex') && !usedToday.has(t.technicianId);
      });

      available.sort((a, b) => {
        const byTotal = totalShifts.get(a.technicianId)! - totalShifts.get(b.technicianId)!;
        if (byTotal !== 0) return byTotal;
        if (shift === 'morning') {
          // keep flex technicians in reserve for the evening shift
          const aFlex = a.constraints[date] === 'flex' ? 1 : 0;
          const bFlex = b.constraints[date] === 'flex' ? 1 : 0;
          if (aFlex !== bFlex) return aFlex - bFlex;
        }
        const byType =
          shiftTypeCounts[shift].get(a.technicianId)! - shiftTypeCounts[shift].get(b.technicianId)!;
        if (byType !== 0) return byType;
        return a.technicianId - b.technicianId;
      });

      for (let station = 1; station <= Math.min(STATIONS, available.length); station++) {
        const t = available[station - 1];
        result.push({ date, shift, station, technicianId: t.technicianId });
        usedToday.add(t.technicianId);
        totalShifts.set(t.technicianId, totalShifts.get(t.technicianId)! + 1);
        shiftTypeCounts[shift].set(t.technicianId, shiftTypeCounts[shift].get(t.technicianId)! + 1);
      }
    }
  }

  return result;
}
