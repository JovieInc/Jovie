import { describe, expect, it } from 'vitest';
import {
  ACTION_HIT_PX,
  ACTION_TOP_PX,
  DIAL_ICON_OPTICAL_CLASS,
  DIAL_ICON_OPTICAL_Y_PX,
  OUTER_STEP_PX,
  ROW_HIT_PX,
  ROW_ORIGIN_TOP_PX,
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
    expect(rowLayout(1)).toEqual({ y: ROW_STEP_PX, scale: 1, opacity: 0.78 });
    expect(rowLayout(-1)).toEqual({
      y: -ROW_STEP_PX,
      scale: 1,
      opacity: 0.78,
    });
  });
  it('compresses and dims the outer rows', () => {
    const outer = rowLayout(2);
    expect(outer.y).toBe(ROW_STEP_PX + OUTER_STEP_PX);
    expect(outer.opacity).toBeCloseTo(0.48, 12);
    expect(outer.scale).toBeCloseTo(0.88, 12);
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
    expect(half.opacity).toBeCloseTo(0.39, 12);
    expect(rowLayout(1.5).opacity).toBeCloseTo(0.63, 12);
    expect(rowLayout(2.5).opacity).toBeCloseTo(0.24, 12);
  });
  it('keeps hit height above the HIG floor and a 1px optical icon drop', () => {
    expect(ROW_HIT_PX).toBeGreaterThanOrEqual(44);
    expect(ROW_HIT_PX).toBeLessThanOrEqual(ROW_STEP_PX);
    expect(DIAL_ICON_OPTICAL_Y_PX).toBe(1);
    expect(DIAL_ICON_OPTICAL_CLASS).toBe('translate-y-px');
  });
  it('centers reel rows on Stream Now so neighbor gaps stay symmetric', () => {
    const actionCenter = ACTION_TOP_PX + ACTION_HIT_PX / 2;
    const rowCenter = ROW_ORIGIN_TOP_PX + ROW_HIT_PX / 2;
    expect(rowCenter).toBe(actionCenter);
    const actionTop = ACTION_TOP_PX;
    const actionBottom = ACTION_TOP_PX + ACTION_HIT_PX;
    const upperBottom = rowCenter - ROW_STEP_PX + ROW_HIT_PX / 2;
    const lowerTop = rowCenter + ROW_STEP_PX - ROW_HIT_PX / 2;
    expect(actionTop - upperBottom).toBe(lowerTop - actionBottom);
  });
});

describe('rowIsTappable', () => {
  it('excludes the docked row and the compressed outer rows', () => {
    expect(rowIsTappable(0)).toBe(false);
    expect(rowIsTappable(0.49)).toBe(false);
    expect(rowIsTappable(0.5)).toBe(true);
    expect(rowIsTappable(-1)).toBe(true);
    expect(rowIsTappable(1.6)).toBe(true);
    expect(rowIsTappable(1.61)).toBe(false);
    expect(rowIsTappable(-2)).toBe(false);
  });
});
