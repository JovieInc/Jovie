/**
 * Geometry of the service reel. `distance` is signed items from center; the
 * centered row sits behind Stream Now, so its label fades as it docks.
 */

export const ROW_STEP_PX = 52;
export const OUTER_STEP_PX = 30;
export const WINDOW_RADIUS = 5;
/** Row hit height on-scale (`h-12` = 48). */
export const ROW_HIT_PX = 48;
/** Stream Now `top-20` / `min-h-13`. */
export const ACTION_TOP_PX = 80;
export const ACTION_HIT_PX = 52;
/** Reel `top` so row midlines match Stream Now. */
export const ROW_ORIGIN_TOP_PX =
  ACTION_TOP_PX + ACTION_HIT_PX / 2 - ROW_HIT_PX / 2;
/** 1px optical drop for brand marks (DESIGN.md). */
export const DIAL_ICON_OPTICAL_CLASS = 'translate-y-px';

export interface RowLayout {
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function rowLayout(distance: number): RowLayout {
  const abs = Math.abs(distance);
  const sign = distance < 0 ? -1 : 1;
  const y =
    abs <= 1
      ? abs * ROW_STEP_PX
      : ROW_STEP_PX + (Math.min(abs, 3) - 1) * OUTER_STEP_PX;
  let opacity = 0;
  if (abs < 1) opacity = lerp(0, 0.78, abs);
  else if (abs < 2) opacity = lerp(0.78, 0.48, abs - 1);
  else if (abs < 3) opacity = lerp(0.48, 0, abs - 2);
  const scale = abs <= 1 ? 1 : lerp(1, 0.88, Math.min(abs - 1, 1));
  return { y: sign * y, scale, opacity };
}

export function rowIsTappable(distance: number): boolean {
  const abs = Math.abs(distance);
  return abs >= 0.5 && abs <= 1.6;
}

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
    /* storage may be blocked */
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
