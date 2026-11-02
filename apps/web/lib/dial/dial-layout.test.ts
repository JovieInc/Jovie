import { describe, expect, it } from 'vitest';
import {
  OUTER_STEP_PX,
  ROW_STEP_PX,
  rowIsTappable,
  rowLayout,
  WINDOW_RADIUS,
} from './dial-layout';

describe('rowLayout', () => {
  it('puts the docked row at the center, hidden behind the button', () => {
    expect(rowLayout(0)).toEqual({ y: 0, scale: 1, opacity: 0 });
  });
  it('places adjacent rows one step away at the resting opacity', () => {
    expect(rowLayout(1)).toEqual({ y: ROW_STEP_PX, scale: 1, opacity: 0.8 });
    expect(rowLayout(-1)).toEqual({ y: -ROW_STEP_PX, scale: 1, opacity: 0.8 });
  });
  it('compresses and dims the outer rows', () => {
    const outer = rowLayout(2);
    expect(outer.y).toBe(ROW_STEP_PX + OUTER_STEP_PX);
    expect(outer.opacity).toBeCloseTo(0.5, 12);
    expect(outer.scale).toBeCloseTo(0.86, 12);
    expect(rowLayout(-2).y).toBe(-outer.y);
  });
  it('fades rows out by the third step and stops moving them', () => {
    expect(rowLayout(3).opacity).toBe(0);
    expect(rowLayout(4).opacity).toBe(0);
    expect(rowLayout(4).y).toBe(rowLayout(3).y);
    expect(WINDOW_RADIUS).toBeGreaterThanOrEqual(4);
  });
  it('is continuous through the breakpoints', () => {
    for (const edge of [1, 2, 3]) {
      const below = rowLayout(edge - 1e-9);
      const above = rowLayout(edge + 1e-9);
      expect(Math.abs(below.y - above.y)).toBeLessThan(1e-4);
      expect(Math.abs(below.opacity - above.opacity)).toBeLessThan(1e-6);
      expect(Math.abs(below.scale - above.scale)).toBeLessThan(1e-6);
    }
  });
  it('interpolates between the center and the first step', () => {
    const half = rowLayout(0.5);
    expect(half.y).toBe(ROW_STEP_PX / 2);
    expect(half.opacity).toBeCloseTo(0.4, 12);
    expect(rowLayout(1.5).opacity).toBeCloseTo(0.65, 12);
    expect(rowLayout(2.5).opacity).toBeCloseTo(0.25, 12);
  });
});

describe('rowIsTappable', () => {
  it('excludes the docked row and the compressed outer rows', () => {
    expect(rowIsTappable(0)).toBe(false);
    expect(rowIsTappable(0.59)).toBe(false);
    expect(rowIsTappable(0.6)).toBe(true);
    expect(rowIsTappable(-1)).toBe(true);
    expect(rowIsTappable(1.5)).toBe(true);
    expect(rowIsTappable(1.51)).toBe(false);
    expect(rowIsTappable(-2)).toBe(false);
  });
});
