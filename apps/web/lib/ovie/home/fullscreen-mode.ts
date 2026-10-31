/**
 * Full screen: the office ultra-wide shows Home all day with nobody touching it.
 * Pure rules only (staleness, scale, burn-in drift, reload policy) so they are
 * testable without a browser; the component applies them.
 */

export interface FullscreenFeed {
  readonly id: string;
  /** Epoch ms of the last successful read; 0 or null when never loaded. */
  readonly updatedAtMs: number | null;
  /** The feed's own poll interval. */
  readonly pollMs: number;
}

export type FullscreenFeedLevel = 'live' | 'stale' | 'down';

export interface FullscreenFeedStatus {
  readonly level: FullscreenFeedLevel;
  /** Feeds past their stale threshold, worst first. */
  readonly stale: readonly {
    readonly id: string;
    readonly ageMs: number | null;
  }[];
}

/** One missed poll, one retry and jitter: three intervals means the feed stopped. */
export const FULLSCREEN_STALE_AFTER_POLLS = 3;
/** Ten intervals with no data is an outage, not a blip. */
export const FULLSCREEN_DOWN_AFTER_POLLS = 10;
/** Never go below this: a 6s feed must not flicker "stale" on one slow read. */
export const FULLSCREEN_MIN_STALE_MS = 30_000;
/** Reload a screen that has been down this long (clears wedged tabs, picks up new deploys). */
export const FULLSCREEN_RELOAD_AFTER_DOWN_MS = 120_000;
/** Never reload more often than this, so a hard outage cannot loop. */
export const FULLSCREEN_RELOAD_COOLDOWN_MS = 300_000;

export function fullscreenFeedStatus(
  feeds: readonly FullscreenFeed[],
  nowMs: number
): FullscreenFeedStatus {
  let level: FullscreenFeedLevel = 'live';
  const stale: { id: string; ageMs: number | null }[] = [];
  for (const feed of feeds) {
    const age =
      feed.updatedAtMs && feed.updatedAtMs > 0
        ? Math.max(0, nowMs - feed.updatedAtMs)
        : null;
    const staleAfter = Math.max(
      FULLSCREEN_MIN_STALE_MS,
      feed.pollMs * FULLSCREEN_STALE_AFTER_POLLS
    );
    const downAfter = Math.max(
      FULLSCREEN_MIN_STALE_MS,
      feed.pollMs * FULLSCREEN_DOWN_AFTER_POLLS
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
export function formatFeedAge(ageMs: number | null): string {
  if (ageMs === null) return 'never loaded';
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/**
 * The HUD is laid out for a 1280x720 canvas and scaled to the display, by
 * whichever axis is tighter, so the scaled canvas always fits and the type is
 * as large as the display allows: 3440x1440 -> 2x, 5120x2160 -> 3x, 1920x1080
 * -> 1.5x, and phones stay 1x. Scaling the whole surface keeps every ratio and
 * token, so there is no separate type scale to drift.
 */
export const FULLSCREEN_BASE_WIDTH_PX = 1280;
export const FULLSCREEN_BASE_HEIGHT_PX = 720;
export const FULLSCREEN_MAX_SCALE = 3;

export function fullscreenScale(
  viewportWidthPx: number,
  viewportHeightPx: number
): number {
  if (
    !Number.isFinite(viewportWidthPx) ||
    !Number.isFinite(viewportHeightPx) ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0
  )
    return 1;
  const raw = Math.min(
    viewportWidthPx / FULLSCREEN_BASE_WIDTH_PX,
    viewportHeightPx / FULLSCREEN_BASE_HEIGHT_PX
  );
  return Math.min(
    FULLSCREEN_MAX_SCALE,
    Math.max(1, Math.round(raw * 100) / 100)
  );
}

/**
 * Burn-in drift: shift the whole surface a few px once a minute, along a path
 * that never repeats within an hour. No animation of content, only position.
 */
/** Drift must stay inside the canvas padding (p-4 = 16px) so no content ever clips. */
export const FULLSCREEN_DRIFT_MAX_PX = 10;
export const FULLSCREEN_CANVAS_PADDING_PX = 16;

export function fullscreenDrift(
  nowMs: number,
  amplitudePx = FULLSCREEN_DRIFT_MAX_PX
): { readonly x: number; readonly y: number } {
  const minute = Math.floor(nowMs / 60_000);
  return {
    x: Math.round(Math.sin(minute * 0.9) * amplitudePx),
    y: Math.round(Math.cos(minute * 0.7) * amplitudePx),
  };
}

export function shouldReloadFullscreen(input: {
  readonly level: FullscreenFeedLevel;
  readonly downSinceMs: number | null;
  readonly lastReloadMs: number | null;
  readonly nowMs: number;
}): boolean {
  if (input.level !== 'down' || input.downSinceMs === null) return false;
  if (input.nowMs - input.downSinceMs < FULLSCREEN_RELOAD_AFTER_DOWN_MS)
    return false;
  return (
    input.lastReloadMs === null ||
    input.nowMs - input.lastReloadMs >= FULLSCREEN_RELOAD_COOLDOWN_MS
  );
}

/** Per-device preference: Full screen stays on across reloads until toggled off. */
export const FULLSCREEN_STORAGE_KEY = 'ovie-home-fullscreen';
/** Fired by the command palette (and anything else) to toggle Full screen. */
export const FULLSCREEN_TOGGLE_EVENT = 'ovie:fullscreen-toggle';

export interface FullscreenShortcutEvent {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly code: string;
}

/**
 * Web: Cmd+Shift+F (Cmd+F is Find, so Shift keeps it clear). Mac app: also
 * Ctrl+Cmd+F, macOS's own fullscreen chord. Ctrl+Cmd+F stays unclaimed on web
 * because the browser owns it.
 */
export function matchesFullscreenShortcut(
  event: FullscreenShortcutEvent,
  inDesktopApp: boolean
): boolean {
  if (event.code !== 'KeyF' || event.altKey) return false;
  if (event.metaKey && event.shiftKey && !event.ctrlKey) return true;
  return inDesktopApp && event.metaKey && event.ctrlKey && !event.shiftKey;
}

export function fullscreenShortcutLabel(inDesktopApp: boolean): string {
  return inDesktopApp ? '⌃⌘F' : '⌘⇧F';
}
