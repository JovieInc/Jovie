/**
 * Geometry of the service reel. `distance` is a row's signed distance from the
 * centered item in items (row index minus the live position). The centered row
 * sits behind the Stream Now button, so its label fades out as it docks.
 */

/** Pixels between adjacent row centers near the center. */
export const ROW_STEP_PX = 56;
/** Pixels between row centers further out, where rows are compressed. */
export const OUTER_STEP_PX = 34;
/** Rows further than this from the center are not rendered. */
export const WINDOW_RADIUS = 5;

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
  if (abs < 1) opacity = lerp(0, 0.55, abs);
  else if (abs < 2) opacity = lerp(0.55, 0.2, abs - 1);
  else if (abs < 3) opacity = lerp(0.2, 0, abs - 2);
  const scale = abs <= 1 ? 1 : lerp(1, 0.86, Math.min(abs - 1, 1));
  return { y: sign * y, scale, opacity };
}

/** Whether a row at this distance should take taps (not under the button). */
export function rowIsTappable(distance: number): boolean {
  const abs = Math.abs(distance);
  return abs >= 0.6 && abs <= 1.5;
}
