import { describe, expect, it } from 'vitest';
import {
  FULLSCREEN_CANVAS_PADDING_PX,
  FULLSCREEN_DRIFT_MAX_PX,
  FULLSCREEN_RELOAD_AFTER_DOWN_MS,
  FULLSCREEN_RELOAD_COOLDOWN_MS,
  type FullscreenShortcutEvent,
  formatFeedAge,
  fullscreenDrift,
  fullscreenFeedStatus,
  fullscreenScale,
  fullscreenShortcutLabel,
  matchesFullscreenShortcut,
  shouldReloadFullscreen,
} from './fullscreen-mode';

const NOW = 1_000_000_000;
const feed = (id: string, ageMs: number | null, pollMs: number) => ({
  id,
  updatedAtMs: ageMs === null ? null : NOW - ageMs,
  pollMs,
});

describe('fullscreenFeedStatus', () => {
  it('is live when every feed is within three polls', () => {
    expect(
      fullscreenFeedStatus(
        [feed('a', 10_000, 6_000), feed('b', 80_000, 60_000)],
        NOW
      ).level
    ).toBe('live');
  });
  it('does not flicker on a fast feed: 30s floor', () => {
    expect(fullscreenFeedStatus([feed('a', 25_000, 6_000)], NOW).level).toBe(
      'live'
    );
    expect(fullscreenFeedStatus([feed('a', 35_000, 6_000)], NOW).level).toBe(
      'stale'
    );
  });
  it('a feed that never loaded is down, never live', () => {
    const status = fullscreenFeedStatus([feed('a', null, 30_000)], NOW);
    expect(status.level).toBe('down');
    expect(status.stale[0]?.id).toBe('a');
  });
  it('ten polls without data is down; worst feed first', () => {
    const status = fullscreenFeedStatus(
      [feed('a', 100_000, 30_000), feed('b', 400_000, 30_000)],
      NOW
    );
    expect(status.level).toBe('down');
    expect(status.stale.map(item => item.id)).toEqual(['b', 'a']);
  });
  it('no feeds at all is live only because nothing is claimed', () => {
    expect(fullscreenFeedStatus([], NOW).level).toBe('live');
  });
});

describe('fullscreenScale', () => {
  it('scales by the tighter axis so the canvas always fits, never shrinks', () => {
    expect(fullscreenScale(3440, 1440)).toBe(2);
    expect(fullscreenScale(5120, 2160)).toBe(3);
    expect(fullscreenScale(1920, 1080)).toBe(1.5);
    expect(fullscreenScale(1440, 900)).toBe(1.13);
    expect(fullscreenScale(390, 844)).toBe(1);
    expect(fullscreenScale(Number.NaN, 900)).toBe(1);
    expect(fullscreenScale(99_999, 99_999)).toBe(3);
  });
  it('the scaled canvas never exceeds the viewport on either axis', () => {
    for (const [w, h] of [
      [3440, 1440],
      [5120, 2160],
      [1920, 1080],
      [2560, 1080],
      [800, 1200],
    ] as const) {
      const scale = fullscreenScale(w, h);
      expect(1280 * scale).toBeLessThanOrEqual(Math.max(w, 1280));
      expect(720 * scale).toBeLessThanOrEqual(Math.max(h, 720));
    }
  });
});

describe('fullscreenDrift', () => {
  it('stays inside the canvas padding, so drift can never clip content', () => {
    expect(FULLSCREEN_DRIFT_MAX_PX).toBeLessThan(FULLSCREEN_CANVAS_PADDING_PX);
  });
  it('stays within the amplitude and holds for a minute', () => {
    for (let m = 0; m < 600; m++) {
      const { x, y } = fullscreenDrift(m * 60_000, 10);
      expect(Math.abs(x)).toBeLessThanOrEqual(10);
      expect(Math.abs(y)).toBeLessThanOrEqual(10);
    }
    expect(fullscreenDrift(120_000)).toEqual(fullscreenDrift(179_999));
  });
  it('actually moves', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 60; m++)
      seen.add(JSON.stringify(fullscreenDrift(m * 60_000)));
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe('shouldReloadFullscreen', () => {
  const base = { level: 'down' as const, downSinceMs: 0, lastReloadMs: null };
  it('waits out brief outages', () => {
    expect(
      shouldReloadFullscreen({
        ...base,
        nowMs: FULLSCREEN_RELOAD_AFTER_DOWN_MS - 1,
      })
    ).toBe(false);
  });
  it('reloads a long outage once, then respects the cooldown', () => {
    expect(
      shouldReloadFullscreen({
        ...base,
        nowMs: FULLSCREEN_RELOAD_AFTER_DOWN_MS,
      })
    ).toBe(true);
    expect(
      shouldReloadFullscreen({
        ...base,
        lastReloadMs: FULLSCREEN_RELOAD_AFTER_DOWN_MS,
        nowMs:
          FULLSCREEN_RELOAD_AFTER_DOWN_MS + FULLSCREEN_RELOAD_COOLDOWN_MS - 1,
      })
    ).toBe(false);
  });
  it('never reloads a healthy screen', () => {
    expect(
      shouldReloadFullscreen({ ...base, level: 'stale', nowMs: 10_000_000 })
    ).toBe(false);
  });
});

describe('formatFeedAge', () => {
  it('reads at a glance', () => {
    expect(formatFeedAge(null)).toBe('never loaded');
    expect(formatFeedAge(45_000)).toBe('45s');
    expect(formatFeedAge(5 * 60_000)).toBe('5m');
    expect(formatFeedAge(3 * 3_600_000)).toBe('3h');
  });
});

describe('matchesFullscreenShortcut', () => {
  const ev = (
    o: Partial<FullscreenShortcutEvent>
  ): FullscreenShortcutEvent => ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    code: 'KeyF',
    ...o,
  });
  it('web: Cmd+Shift+F only; plain Cmd+F stays Find', () => {
    expect(
      matchesFullscreenShortcut(ev({ metaKey: true, shiftKey: true }), false)
    ).toBe(true);
    expect(matchesFullscreenShortcut(ev({ metaKey: true }), false)).toBe(false);
    expect(
      matchesFullscreenShortcut(ev({ metaKey: true, ctrlKey: true }), false)
    ).toBe(false);
  });
  it('Mac app: Ctrl+Cmd+F also works, Cmd+Shift+F still works', () => {
    expect(
      matchesFullscreenShortcut(ev({ metaKey: true, ctrlKey: true }), true)
    ).toBe(true);
    expect(
      matchesFullscreenShortcut(ev({ metaKey: true, shiftKey: true }), true)
    ).toBe(true);
    expect(
      matchesFullscreenShortcut(
        ev({ metaKey: true, altKey: true, shiftKey: true }),
        true
      )
    ).toBe(false);
    expect(
      matchesFullscreenShortcut(
        ev({ metaKey: true, shiftKey: true, code: 'KeyG' }),
        true
      )
    ).toBe(false);
  });
  it('labels the shortcut per platform', () => {
    expect(fullscreenShortcutLabel(false)).toBe('⌘⇧F');
    expect(fullscreenShortcutLabel(true)).toBe('⌃⌘F');
  });
});
