/**
 * Wall mode: the office ultra-wide shows Home all day with nobody touching it.
 * Pure rules only (staleness, scale, burn-in drift, reload policy) so they are
 * testable without a browser; the component applies them.
 */

export interface WallFeed {
  readonly id: string;
  /** Epoch ms of the last successful read; 0 or null when never loaded. */
  readonly updatedAtMs: number | null;
  /** The feed's own poll interval. */
  readonly pollMs: number;
}

export type WallFeedLevel = 'live' | 'stale' | 'down';

export interface WallFeedStatus {
  readonly level: WallFeedLevel;
  /** Feeds past their stale threshold, worst first. */
  readonly stale: readonly {
    readonly id: string;
    readonly ageMs: number | null;
  }[];
}

/** One missed poll, one retry and jitter: three intervals means the feed stopped. */
export const WALL_STALE_AFTER_POLLS = 3;
/** Ten intervals with no data is an outage, not a blip. */
export const WALL_DOWN_AFTER_POLLS = 10;
/** Never go below this: a 6s feed must not flicker "stale" on one slow read. */
export const WALL_MIN_STALE_MS = 30_000;
/** Reload a wall that has been down this long (clears wedged tabs, picks up new deploys). */
export const WALL_RELOAD_AFTER_DOWN_MS = 120_000;
/** Never reload more often than this, so a hard outage cannot loop. */
export const WALL_RELOAD_COOLDOWN_MS = 300_000;

export function wallFeedStatus(
  feeds: readonly WallFeed[],
  nowMs: number
): WallFeedStatus {
  let level: WallFeedLevel = 'live';
  const stale: { id: string; ageMs: number | null }[] = [];
  for (const feed of feeds) {
    const age =
      feed.updatedAtMs && feed.updatedAtMs > 0
        ? Math.max(0, nowMs - feed.updatedAtMs)
        : null;
    const staleAfter = Math.max(
      WALL_MIN_STALE_MS,
      feed.pollMs * WALL_STALE_AFTER_POLLS
    );
    const downAfter = Math.max(
      WALL_MIN_STALE_MS,
      feed.pollMs * WALL_DOWN_AFTER_POLLS
    );
    if (age === null || age > downAfter) {
      level = 'down';
      stale.push({ id: feed.id, ageMs: age });
    } else if (age > staleAfter) {
      if (level === 'live') level = 'stale';
      stale.push({ id: feed.id, ageMs: age });
    }
  }
  stale.sort((a, b) => (b.ageMs ?? Infinity) - (a.ageMs ?? Infinity));
  return { level, stale };
}

/** "3m", "45s": the age shown on the stale banner. */
export function formatWallAge(ageMs: number | null): string {
  if (ageMs === null) return 'never loaded';
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/** Design width the HUD is laid out for; wider screens scale up from it. */
export const WALL_BASE_WIDTH_PX = 2048;
export const WALL_MAX_SCALE = 3;

/**
 * 5120 wide -> 2.5x, 3440 -> 1.68x, 1920 -> 1x. Scaling the whole surface keeps
 * every ratio and token, so there is no second wall-only type scale to drift.
 */
export function wallScale(viewportWidthPx: number): number {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return 1;
  const raw = viewportWidthPx / WALL_BASE_WIDTH_PX;
  return Math.min(WALL_MAX_SCALE, Math.max(1, Math.round(raw * 100) / 100));
}

/**
 * Burn-in drift: shift the whole surface a few px once a minute, along a path
 * that never repeats within an hour. No animation of content, only position.
 */
export function wallDrift(
  nowMs: number,
  amplitudePx = 10
): { readonly x: number; readonly y: number } {
  const minute = Math.floor(nowMs / 60_000);
  return {
    x: Math.round(Math.sin(minute * 0.9) * amplitudePx),
    y: Math.round(Math.cos(minute * 0.7) * amplitudePx),
  };
}

export function shouldReloadWall(input: {
  readonly level: WallFeedLevel;
  readonly downSinceMs: number | null;
  readonly lastReloadMs: number | null;
  readonly nowMs: number;
}): boolean {
  if (input.level !== 'down' || input.downSinceMs === null) return false;
  if (input.nowMs - input.downSinceMs < WALL_RELOAD_AFTER_DOWN_MS) return false;
  return (
    input.lastReloadMs === null ||
    input.nowMs - input.lastReloadMs >= WALL_RELOAD_COOLDOWN_MS
  );
}
