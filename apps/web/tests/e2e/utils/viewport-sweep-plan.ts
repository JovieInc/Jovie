/**
 * Pure viewport plans for the viewport sweep. Kept free of Playwright so the
 * plan itself is unit-tested (tests/unit/e2e-utils/viewport-sweep-plan.test.ts).
 */

/** Fixed widths, 320..1440. The first eleven are the required minimum. */
export const SWEEP_FIXED_WIDTHS = [
  320, 360, 390, 430, 600, 768, 900, 1024, 1200, 1280, 1440,
] as const;

/**
 * Embedded panes: ChatGPT / Arc style sidebars and split views. Narrow
 * sidebars sit at roughly 360-480, wide split panes at roughly 900-1300.
 */
export const SWEEP_EMBEDDED_WIDTHS = [
  360, 400, 440, 480, 900, 1000, 1100, 1200, 1300,
] as const;

export const SWEEP_HEIGHT = 900;
export const SWEEP_RESIZE_STEP = 40;

/** Widths where every overlay state is opened (mobile, tablet, desktop). */
export const SWEEP_OVERLAY_WIDTHS = [390, 768, 1024, 1440] as const;

/**
 * Continuous resize: start wide, step down to `to` and back up to `from` in
 * `step` px increments. Always ends on exact `to` and `from` widths.
 */
export function planResizeSteps(
  from: number,
  to: number,
  step: number
): readonly number[] {
  if (step <= 0 || from <= to) {
    throw new Error('planResizeSteps needs step > 0 and from > to');
  }
  const down: number[] = [];
  for (let width = from; width > to; width -= step) down.push(width);
  down.push(to);
  const up = [...down].reverse().slice(1);
  return [...down, ...up];
}

/**
 * Split a resize plan into consecutive segments of at most `size` widths so
 * each Playwright test covers one segment and fits the default per-test
 * timeout. Segments are contiguous: the last width of one segment is followed
 * by the first width of the next in the original plan.
 */
export function chunkSteps(
  steps: readonly number[],
  size: number
): readonly (readonly number[])[] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('chunkSteps needs an integer size > 0');
  }
  const segments: number[][] = [];
  for (let index = 0; index < steps.length; index += size) {
    segments.push(steps.slice(index, index + size));
  }
  return segments;
}
