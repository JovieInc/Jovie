import { describe, expect, it } from 'vitest';
import {
  planResizeSteps,
  SWEEP_EMBEDDED_WIDTHS,
  SWEEP_FIXED_WIDTHS,
  SWEEP_RESIZE_STEP,
} from '../../e2e/utils/viewport-sweep-plan';

describe('viewport sweep plan', () => {
  it('covers the required fixed widths from 320 to 1440', () => {
    for (const width of [
      320, 360, 390, 430, 600, 768, 900, 1024, 1200, 1280, 1440,
    ]) {
      expect(SWEEP_FIXED_WIDTHS).toContain(width);
    }
  });

  it('covers narrow and wide embedded panes', () => {
    expect(Math.min(...SWEEP_EMBEDDED_WIDTHS)).toBeLessThanOrEqual(360);
    expect(Math.max(...SWEEP_EMBEDDED_WIDTHS)).toBeGreaterThanOrEqual(1300);
    expect(SWEEP_EMBEDDED_WIDTHS.some(w => w >= 900 && w <= 1300)).toBe(true);
    expect(SWEEP_EMBEDDED_WIDTHS.some(w => w >= 360 && w <= 480)).toBe(true);
  });

  it('steps down and back up in 40px increments and ends on both extremes', () => {
    const steps = planResizeSteps(1440, 320, SWEEP_RESIZE_STEP);
    expect(steps[0]).toBe(1440);
    expect(Math.min(...steps)).toBe(320);
    expect(steps.at(-1)).toBe(1440);
    const down = steps.slice(0, steps.indexOf(320) + 1);
    for (let i = 1; i < down.length - 1; i += 1) {
      expect(down[i - 1] - down[i]).toBe(SWEEP_RESIZE_STEP);
    }
    expect(down.at(-2)! - 320).toBeLessThanOrEqual(SWEEP_RESIZE_STEP);
    expect(steps.length).toBe(down.length * 2 - 1);
  });

  it('rejects an empty range', () => {
    expect(() => planResizeSteps(320, 320, 40)).toThrow();
  });
});
