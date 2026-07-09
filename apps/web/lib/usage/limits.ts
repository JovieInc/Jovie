/**
 * Jovie usage limits — display caps + pure window/percent helpers for the
 * header usage pill and limits popover (Opportunity Inbox, issue #11566).
 *
 * These caps are the single tunable source for the usage summary surface.
 * They are DISPLAY caps for the glanceable usage pill; once server-side
 * enforcement lands they should migrate into the entitlement registry
 * (`lib/entitlements/registry.ts`) alongside the other numeric limits.
 *
 * Pure module: safe to import from both server routes and client components.
 */

import { computeRatePercent } from '@/lib/analytics/metrics';
import type { PlanId } from '@/lib/entitlements/registry';

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export interface JovieUsageLimits {
  /** Max suggestions surfaced per calendar week (UTC, Monday start). */
  readonly suggestionsPerWeek: number;
  /** Max live actions executed within a rolling 5-hour window. */
  readonly liveActionsPer5h: number;
}

/** Rolling window for live actions: 5 hours, in milliseconds. */
export const LIVE_ACTION_WINDOW_MS = 5 * 60 * 60 * 1000;

const USAGE_LIMITS: Record<PlanId, JovieUsageLimits> = {
  free: { suggestionsPerWeek: 15, liveActionsPer5h: 5 },
  trial: { suggestionsPerWeek: 75, liveActionsPer5h: 25 },
  pro: { suggestionsPerWeek: 75, liveActionsPer5h: 25 },
  max: { suggestionsPerWeek: 200, liveActionsPer5h: 100 },
};

export function getUsageLimits(plan: PlanId): JovieUsageLimits {
  return USAGE_LIMITS[plan];
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export interface WeeklyUsageWindow {
  /** Start of the current usage week (UTC Monday 00:00). */
  readonly start: Date;
  /** Start of the next usage week — when the weekly counter resets. */
  readonly resetAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Current calendar-week window, UTC, starting Monday 00:00. */
export function getWeeklyUsageWindow(now = new Date()): WeeklyUsageWindow {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday
    )
  );
  return { start, resetAt: new Date(start.getTime() + 7 * DAY_MS) };
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

/** Percent of a quota still remaining, clamped to 0–100. */
export function getRemainingPercent(used: number, limit: number): number {
  const remaining = Math.max(0, limit - used);
  return computeRatePercent(remaining, limit, 0);
}

// ---------------------------------------------------------------------------
// Summary payload shape (shared by the API route and the client hook)
// ---------------------------------------------------------------------------

export interface UsageSummaryData {
  readonly plan: PlanId;
  readonly planDisplayName: string;
  readonly suggestions: {
    readonly used: number;
    readonly limit: number;
    readonly remaining: number;
    readonly remainingPercent: number;
    /** ISO timestamp — start of next week (UTC Monday). */
    readonly resetAt: string;
  };
  readonly liveActions: {
    readonly used: number;
    readonly limit: number;
    readonly remaining: number;
    /**
     * ISO timestamp when the oldest action in the rolling window ages out.
     * Null when no live actions were executed in the current window.
     */
    readonly resetAt: string | null;
  };
  /** Overall remaining percent — the tighter of the two quotas. */
  readonly remainingPercent: number;
  /** Present when counts were unavailable and the snapshot is degraded. */
  readonly _stale?: boolean;
}

// ---------------------------------------------------------------------------
// Client-side formatting
// ---------------------------------------------------------------------------

/** "Resets <day>" — short weekday name for a weekly reset, e.g. "Mon". */
export function formatResetDay(value: string | null | undefined): string {
  if (!value) return '—';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(resetAt);
}

/** "Resets in <time>" — compact duration until an ISO timestamp, e.g. "3h 05m". */
export function formatResetIn(
  value: string | null | undefined,
  now = new Date()
): string {
  if (!value) return '—';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return '—';

  const deltaMs = resetAt.getTime() - now.getTime();
  if (deltaMs <= 0) return 'now';

  const totalMinutes = Math.ceil(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
