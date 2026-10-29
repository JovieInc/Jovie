import { describe, expect, it } from 'vitest';
import { buildLinkAnalyticsFixture } from './linkAnalyticsFixture';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('buildLinkAnalyticsFixture', () => {
  it.each([
    '2026-10-29T00:00:01.000Z',
    '2026-10-29T12:30:00.000Z',
    '2027-03-01T23:59:59.000Z',
    '2031-06-15T08:00:00.000Z',
  ])('keeps the last click inside the 7-day window at %s', iso => {
    const now = new Date(iso);
    const fixture = buildLinkAnalyticsFixture(now);
    const ageMs = now.getTime() - new Date(fixture.lastClickAt ?? '').getTime();

    expect(fixture.last7DaysClicks).toBeGreaterThan(0);
    expect(ageMs).toBeGreaterThanOrEqual(0);
    // Clicks this week means the last click is within the last day, never "2mo ago".
    expect(ageMs).toBeLessThanOrEqual(DAY_MS);
    expect(fixture.totalClicks).toBeGreaterThanOrEqual(fixture.last7DaysClicks);
  });
});
