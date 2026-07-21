import { expect, test, vi } from 'vitest';
import { sanitizeWindowState } from '../src/window-state.ts';

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1080 };
const SECONDARY = { x: 1920, y: 0, width: 2560, height: 1440 };

test('non-object state falls back to defaults', () => {
  expect(sanitizeWindowState(undefined, PRIMARY)).toEqual({
    width: 1280,
    height: 800,
  });
});

test('keeps saved bounds parked on a connected secondary display', () => {
  const saved = { x: 2200, y: 300, width: 1200, height: 800 };
  const report = vi.fn();
  const state = sanitizeWindowState(saved, PRIMARY, report, [
    PRIMARY,
    SECONDARY,
  ]);

  expect(state).toEqual({ x: 2200, y: 300, width: 1200, height: 800 });
  expect(report).not.toHaveBeenCalled();
});

test('keeps bounds that only partially intersect a connected display', () => {
  const saved = { x: 1900, y: 1000, width: 1200, height: 800 };
  const state = sanitizeWindowState(saved, PRIMARY, undefined, [
    PRIMARY,
    SECONDARY,
  ]);

  expect(state.x).toBe(1900);
  expect(state.y).toBe(1000);
});

test('clamps into the primary display when saved bounds intersect no connected display', () => {
  // Disconnected-monitor fallback: the saved position is off every connected
  // display, so the window must come back to the primary work area.
  const saved = { x: 2200, y: 300, width: 1200, height: 800 };
  const report = vi.fn();
  const state = sanitizeWindowState(saved, PRIMARY, report, [PRIMARY]);

  expect(state.x).toBe(720); // 1920 - 1200
  expect(state.y).toBe(280); // 1080 - 800
  expect(state.width).toBe(1200);
  expect(state.height).toBe(800);
  expect(report).toHaveBeenCalledWith('window-state-clamped');
});

test('without connected display info, keeps legacy clamp-to-primary behavior', () => {
  const saved = { x: 4000, y: 50, width: 1200, height: 800 };
  const state = sanitizeWindowState(saved, PRIMARY);

  expect(state.x).toBe(720);
  expect(state.y).toBe(50);
});

test('missing x/y stays undefined so Electron picks the default position', () => {
  const state = sanitizeWindowState(
    { width: 1200, height: 800 },
    PRIMARY,
    undefined,
    [PRIMARY, SECONDARY]
  );

  expect(state.x).toBeUndefined();
  expect(state.y).toBeUndefined();
});
