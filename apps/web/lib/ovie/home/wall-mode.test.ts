import { describe, expect, it } from 'vitest';
import {
  formatWallAge,
  shouldReloadWall,
  WALL_RELOAD_AFTER_DOWN_MS,
  WALL_RELOAD_COOLDOWN_MS,
  wallDrift,
  wallFeedStatus,
  wallScale,
} from './wall-mode';

const NOW = 1_000_000_000;
const feed = (id: string, ageMs: number | null, pollMs: number) => ({
  id,
  updatedAtMs: ageMs === null ? null : NOW - ageMs,
  pollMs,
});

describe('wallFeedStatus', () => {
  it('is live when every feed is within three polls', () => {
    expect(
      wallFeedStatus([feed('a', 10_000, 6_000), feed('b', 80_000, 60_000)], NOW)
        .level
    ).toBe('live');
  });
  it('does not flicker on a fast feed: 30s floor', () => {
    expect(wallFeedStatus([feed('a', 25_000, 6_000)], NOW).level).toBe('live');
    expect(wallFeedStatus([feed('a', 35_000, 6_000)], NOW).level).toBe('stale');
  });
  it('a feed that never loaded is down, never live', () => {
    const status = wallFeedStatus([feed('a', null, 30_000)], NOW);
    expect(status.level).toBe('down');
    expect(status.stale[0]?.id).toBe('a');
  });
  it('ten polls without data is down; worst feed first', () => {
    const status = wallFeedStatus(
      [feed('a', 100_000, 30_000), feed('b', 400_000, 30_000)],
      NOW
    );
    expect(status.level).toBe('down');
    expect(status.stale.map(item => item.id)).toEqual(['b', 'a']);
  });
  it('no feeds at all is live only because nothing is claimed', () => {
    expect(wallFeedStatus([], NOW).level).toBe('live');
  });
});

describe('wallScale', () => {
  it('scales the ultra-wides and never shrinks', () => {
    expect(wallScale(5120)).toBe(2.5);
    expect(wallScale(3440)).toBe(1.68);
    expect(wallScale(1280)).toBe(1);
    expect(wallScale(Number.NaN)).toBe(1);
    expect(wallScale(99_999)).toBe(3);
  });
});

describe('wallDrift', () => {
  it('stays within the amplitude and holds for a minute', () => {
    for (let m = 0; m < 600; m++) {
      const { x, y } = wallDrift(m * 60_000, 10);
      expect(Math.abs(x)).toBeLessThanOrEqual(10);
      expect(Math.abs(y)).toBeLessThanOrEqual(10);
    }
    expect(wallDrift(120_000)).toEqual(wallDrift(179_999));
  });
  it('actually moves', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 60; m++)
      seen.add(JSON.stringify(wallDrift(m * 60_000)));
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe('shouldReloadWall', () => {
  const base = { level: 'down' as const, downSinceMs: 0, lastReloadMs: null };
  it('waits out brief outages', () => {
    expect(
      shouldReloadWall({ ...base, nowMs: WALL_RELOAD_AFTER_DOWN_MS - 1 })
    ).toBe(false);
  });
  it('reloads a long outage once, then respects the cooldown', () => {
    expect(
      shouldReloadWall({ ...base, nowMs: WALL_RELOAD_AFTER_DOWN_MS })
    ).toBe(true);
    expect(
      shouldReloadWall({
        ...base,
        lastReloadMs: WALL_RELOAD_AFTER_DOWN_MS,
        nowMs: WALL_RELOAD_AFTER_DOWN_MS + WALL_RELOAD_COOLDOWN_MS - 1,
      })
    ).toBe(false);
  });
  it('never reloads a healthy wall', () => {
    expect(
      shouldReloadWall({ ...base, level: 'stale', nowMs: 10_000_000 })
    ).toBe(false);
  });
});

describe('formatWallAge', () => {
  it('reads at a glance', () => {
    expect(formatWallAge(null)).toBe('never loaded');
    expect(formatWallAge(45_000)).toBe('45s');
    expect(formatWallAge(5 * 60_000)).toBe('5m');
    expect(formatWallAge(3 * 3_600_000)).toBe('3h');
  });
});
