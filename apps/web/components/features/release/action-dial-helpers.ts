import { ROW_STEP_PX } from '@/lib/dial/dial-layout';

export const TAP_SLOP_PX = 6;
export const PAGE_STEP = 5;
export const MIN_HAPTIC_GAP_MS = 24;
export const MIN_PULSE_GAP_MS = 90;
export const TYPEAHEAD_RESET_MS = 700;
export const NO_HAPTIC = Symbol('no-haptic');
export const DIAL_HINT_SEEN_KEY = 'jovie:dial-hint-seen';

export function readHintSeen(): boolean {
  try {
    return globalThis.localStorage.getItem(DIAL_HINT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHintSeen(): void {
  try {
    globalThis.localStorage.setItem(DIAL_HINT_SEEN_KEY, '1');
  } catch {
    // Preference still works when storage is unavailable.
  }
}

export interface DialGesture {
  readonly id: number;
  readonly startY: number;
  moved: boolean;
  readonly caught: boolean;
}

export function normalizeWheel(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * ROW_STEP_PX;
  if (event.deltaMode === 2) return event.deltaY * ROW_STEP_PX * 3;
  return event.deltaY;
}

export function isWheelNotch(event: WheelEvent): boolean {
  if (event.deltaMode === 1) return true;
  const magnitude = Math.abs(event.deltaY);
  return (
    Number.isInteger(event.deltaY) &&
    magnitude >= 100 &&
    (magnitude % 100 === 0 || magnitude % 120 === 0)
  );
}

export const dialBrowserScheduler = {
  now: () => performance.now(),
  request: (callback: (time: number) => void) =>
    requestAnimationFrame(callback),
  cancel: (handle: number) => cancelAnimationFrame(handle),
};
