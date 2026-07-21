import { test, expect } from 'vitest';
import { generateAssignments, type TechAvailability } from '@/lib/scheduler';

const D1 = '2026-07-19';
const D2 = '2026-07-20';

function tech(id: number, constraints: Record<string, string>): TechAvailability {
  return { technicianId: id, constraints: constraints as TechAvailability['constraints'] };
}

test('fills 4 stations per shift when enough technicians', () => {
  const techs = [
    ...Array.from({ length: 4 }, (_, i) => tech(i + 1, { [D1]: 'morning' })),
    ...Array.from({ length: 4 }, (_, i) => tech(i + 5, { [D1]: 'evening' })),
  ];
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(8);
  expect(result.filter(a => a.shift === 'morning').map(a => a.station).sort()).toEqual([1, 2, 3, 4]);
  expect(result.filter(a => a.shift === 'evening').map(a => a.station).sort()).toEqual([1, 2, 3, 4]);
});

test('never assigns a technician twice in one day (flex goes to one shift only)', () => {
  const techs = Array.from({ length: 8 }, (_, i) => tech(i + 1, { [D1]: 'flex' }));
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(8);
  const ids = result.map(a => a.technicianId);
  expect(new Set(ids).size).toBe(8);
});

test('respects constraints: off and missing are never assigned', () => {
  const techs = [
    tech(1, { [D1]: 'off' }),
    tech(2, {}), // no constraint entered
    tech(3, { [D1]: 'morning' }),
  ];
  const result = generateAssignments([D1], techs);
  expect(result.every(a => a.technicianId === 3)).toBe(true);
});

test('morning-only technicians never get evening and vice versa', () => {
  const techs = [tech(1, { [D1]: 'morning' }), tech(2, { [D1]: 'evening' })];
  const result = generateAssignments([D1], techs);
  expect(result.find(a => a.technicianId === 1)!.shift).toBe('morning');
  expect(result.find(a => a.technicianId === 2)!.shift).toBe('evening');
});

test('shortage leaves stations empty rather than breaking rules', () => {
  const techs = [tech(1, { [D1]: 'morning' }), tech(2, { [D1]: 'morning' })];
  const result = generateAssignments([D1], techs);
  expect(result).toHaveLength(2);
  expect(result.every(a => a.shift === 'morning')).toBe(true);
});

test('prefers morning-constrained over flex for morning shift', () => {
  const techs = [
    ...Array.from({ length: 4 }, (_, i) => tech(i + 1, { [D1]: 'flex' })),
    ...Array.from({ length: 4 }, (_, i) => tech(i + 5, { [D1]: 'morning' })),
  ];
  const result = generateAssignments([D1], techs);
  const morningIds = result.filter(a => a.shift === 'morning').map(a => a.technicianId).sort();
  expect(morningIds).toEqual([5, 6, 7, 8]); // morning-constrained win the tie
});

test('balances total shifts across the week', () => {
  // 8 techs all flex on two days -> 16 slots, everyone should get exactly 2
  const techs = Array.from({ length: 8 }, (_, i) =>
    tech(i + 1, { [D1]: 'flex', [D2]: 'flex' })
  );
  const result = generateAssignments([D1, D2], techs);
  expect(result).toHaveLength(16);
  const counts = new Map<number, number>();
  for (const a of result) counts.set(a.technicianId, (counts.get(a.technicianId) ?? 0) + 1);
  expect([...counts.values()]).toEqual(Array(8).fill(2));
});

test('deterministic: same input, same output', () => {
  const techs = Array.from({ length: 10 }, (_, i) => tech(i + 1, { [D1]: 'flex', [D2]: 'flex' }));
  expect(generateAssignments([D1, D2], techs)).toEqual(generateAssignments([D1, D2], techs));
});
