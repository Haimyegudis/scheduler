// Pure logic for the constraints screen's multi-select Morning/Evening/Off toggle buttons.
// A day's constraint is stored server-side as a single value: 'morning' | 'evening' | 'flex' | 'off'.
// The UI presents three independent toggle buttons; this module maps between the two shapes.

export type ToggleButton = 'morning' | 'evening' | 'off';

export interface ToggleState {
  morning: boolean;
  evening: boolean;
  off: boolean;
}

export function stateFromValue(value?: string | null): ToggleState {
  if (value === 'flex') return { morning: true, evening: true, off: false };
  if (value === 'morning') return { morning: true, evening: false, off: false };
  if (value === 'evening') return { morning: false, evening: true, off: false };
  if (value === 'off') return { morning: false, evening: false, off: true };
  return { morning: false, evening: false, off: false };
}

export function valueFromState(state: ToggleState): string | null {
  if (state.off) return 'off';
  if (state.morning && state.evening) return 'flex';
  if (state.morning) return 'morning';
  if (state.evening) return 'evening';
  return null;
}

/**
 * Computes the next stored constraint value after a toggle button is clicked.
 * Returns null when the resulting state has nothing selected (caller should delete the constraint).
 * Off is exclusive: selecting it clears morning/evening; selecting morning/evening while off is
 * active clears off first.
 */
export function toggleConstraint(current: string | undefined | null, button: ToggleButton): string | null {
  const state = stateFromValue(current);
  if (button === 'off') {
    return state.off ? null : 'off';
  }
  const next: ToggleState = { morning: state.morning, evening: state.evening, off: false };
  next[button] = !next[button];
  return valueFromState(next);
}
