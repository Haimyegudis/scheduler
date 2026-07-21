import { test, expect } from 'vitest';
import { toggleConstraint, stateFromValue } from '@/lib/constraintToggle';

test('stateFromValue maps stored values back to toggle state', () => {
  expect(stateFromValue(undefined)).toEqual({ morning: false, evening: false, off: false });
  expect(stateFromValue('morning')).toEqual({ morning: true, evening: false, off: false });
  expect(stateFromValue('evening')).toEqual({ morning: false, evening: true, off: false });
  expect(stateFromValue('flex')).toEqual({ morning: true, evening: true, off: false });
  expect(stateFromValue('off')).toEqual({ morning: false, evening: false, off: true });
});

test('selecting morning only yields morning', () => {
  expect(toggleConstraint(undefined, 'morning')).toBe('morning');
});

test('selecting evening only yields evening', () => {
  expect(toggleConstraint(undefined, 'evening')).toBe('evening');
});

test('selecting both morning and evening yields flex', () => {
  const afterMorning = toggleConstraint(undefined, 'morning');
  expect(toggleConstraint(afterMorning, 'evening')).toBe('flex');
});

test('selecting off is exclusive and clears morning/evening', () => {
  expect(toggleConstraint('flex', 'off')).toBe('off');
});

test('selecting morning while off clears off first', () => {
  expect(toggleConstraint('off', 'morning')).toBe('morning');
});

test('deselecting the only active toggle clears the constraint (returns null)', () => {
  expect(toggleConstraint('morning', 'morning')).toBeNull();
  expect(toggleConstraint('evening', 'evening')).toBeNull();
  expect(toggleConstraint('off', 'off')).toBeNull();
});

test('deselecting one side of flex leaves the other', () => {
  expect(toggleConstraint('flex', 'morning')).toBe('evening');
  expect(toggleConstraint('flex', 'evening')).toBe('morning');
});
