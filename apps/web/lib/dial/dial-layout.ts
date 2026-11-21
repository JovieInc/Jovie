/**
 * Geometry of the service reel. `distance` is a row's signed distance from the
 * centered item in items (row index minus the live position). The centered row
 * sits behind the Stream Now button, so its label fades out as it docks.
 */

/** Pixels between adjacent row centers near the center. */
export const ROW_STEP_PX = 52;
/** Pixels between row centers further out, where rows are compressed. */
export const OUTER_STEP_PX = 30;
/** Rows further than this from the center are not rendered. */
export const WINDOW_RADIUS = 5;
/**
 * Comfortable row hit height (Apple HIG floor is 44). Kept on the design-system
 * spacing scale (`h-12` = 48); Stream Now owns the taller primary CTA.
 */
export const ROW_HIT_PX = 48;
/**
 * Static 1px optical drop for brand marks next to dial labels / Stream Now
 * (DESIGN.md icon+text optical correction — shared geometry, not call-site).
 */
export const DIAL_ICON_OPTICAL_Y_PX = 1;
/** Tailwind utility that applies {@link DIAL_ICON_OPTICAL_Y_PX}. */
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
  // 0.78 / 0.48 keep AA labels on the dark surface without competing with Stream Now.
  if (abs < 1) opacity = lerp(0, 0.78, abs);
  else if (abs < 2) opacity = lerp(0.78, 0.48, abs - 1);
  else if (abs < 3) opacity = lerp(0.48, 0, abs - 2);
  const scale = abs <= 1 ? 1 : lerp(1, 0.88, Math.min(abs - 1, 1));
  return { y: sign * y, scale, opacity };
}

/** Whether a row at this distance should take taps (not under the button). */
export function rowIsTappable(distance: number): boolean {
  const abs = Math.abs(distance);
  // Wider than the visual dock so adjacent rows stay easy to hit on touch.
  return abs >= 0.5 && abs <= 1.6;
}
