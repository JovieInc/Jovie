import { describe, expect, it } from 'vitest';
import {
  formatResetDay,
  formatResetIn,
  getRemainingPercent,
  getUsageLimits,
  getWeeklyUsageWindow,
  LIVE_ACTION_WINDOW_MS,
} from '@/lib/usage/limits';

describe('getWeeklyUsageWindow', () => {
  it('starts the window on UTC Monday 00:00', () => {
    // Thursday 2026-07-02 15:30 UTC → week starts Monday 2026-06-29
    const now = new Date('2026-07-02T15:30:00.000Z');
    const window = getWeeklyUsageWindow(now);

    expect(window.start.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(window.resetAt.toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  it('treats Sunday as the last day of the week', () => {
    // Sunday 2026-07-05 → week still starts Monday 2026-06-29
    const now = new Date('2026-07-05T10:00:00.000Z');
    const window = getWeeklyUsageWindow(now);

    expect(window.start.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(window.resetAt.toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  it('starts a fresh window on Monday itself', () => {
    const now = new Date('2026-07-06T00:00:00.000Z');
    const window = getWeeklyUsageWindow(now);

    expect(window.start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(window.resetAt.toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });
});

describe('getRemainingPercent', () => {
  it('returns 100 when nothing is used', () => {
    expect(getRemainingPercent(0, 25)).toBe(100);
  });

  it('returns 0 when the quota is exhausted or exceeded', () => {
    expect(getRemainingPercent(25, 25)).toBe(0);
    expect(getRemainingPercent(30, 25)).toBe(0);
  });

  it('rounds to whole percent', () => {
    expect(getRemainingPercent(1, 3)).toBe(67);
  });

  it('returns 0 for a non-positive limit', () => {
    expect(getRemainingPercent(0, 0)).toBe(0);
  });
});

describe('getUsageLimits', () => {
  it('never decreases caps when upgrading plans', () => {
    const free = getUsageLimits('free');
    const pro = getUsageLimits('pro');
    const max = getUsageLimits('max');

    expect(pro.suggestionsPerWeek).toBeGreaterThanOrEqual(
      free.suggestionsPerWeek
    );
    expect(max.suggestionsPerWeek).toBeGreaterThanOrEqual(
      pro.suggestionsPerWeek
    );
    expect(pro.liveActionsPer5h).toBeGreaterThanOrEqual(free.liveActionsPer5h);
    expect(max.liveActionsPer5h).toBeGreaterThanOrEqual(pro.liveActionsPer5h);
  });

  it('defines positive caps for every plan', () => {
    for (const plan of ['free', 'trial', 'pro', 'max'] as const) {
      const limits = getUsageLimits(plan);
      expect(limits.suggestionsPerWeek).toBeGreaterThan(0);
      expect(limits.liveActionsPer5h).toBeGreaterThan(0);
    }
  });
});

describe('formatResetDay', () => {
  it('formats an ISO timestamp as a short UTC weekday', () => {
    expect(formatResetDay('2026-07-06T00:00:00.000Z')).toBe('Mon');
  });

  it('degrades gracefully on missing or invalid input', () => {
    expect(formatResetDay(null)).toBe('—');
    expect(formatResetDay('not-a-date')).toBe('—');
  });
});

describe('formatResetIn', () => {
  const now = new Date('2026-07-02T12:00:00.000Z');

  it('formats hours and minutes', () => {
    expect(formatResetIn('2026-07-02T15:05:00.000Z', now)).toBe('3h 05m');
  });

  it('formats minutes only under an hour', () => {
    expect(formatResetIn('2026-07-02T12:42:00.000Z', now)).toBe('42m');
  });

  it('formats whole hours without minutes', () => {
    expect(formatResetIn('2026-07-02T14:00:00.000Z', now)).toBe('2h');
  });

  it('returns "now" for past timestamps', () => {
    expect(formatResetIn('2026-07-02T11:00:00.000Z', now)).toBe('now');
  });

  it('degrades gracefully on missing or invalid input', () => {
    expect(formatResetIn(null, now)).toBe('—');
    expect(formatResetIn('not-a-date', now)).toBe('—');
  });
});

describe('LIVE_ACTION_WINDOW_MS', () => {
  it('is exactly five hours', () => {
    expect(LIVE_ACTION_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
  });
});
