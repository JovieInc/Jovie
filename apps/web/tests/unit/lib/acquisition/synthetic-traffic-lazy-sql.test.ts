// @vitest-environment node
/**
 * Closed-loop: realJourney / realJourneyJ must not call drizzle `sql` at
 * module load. Partial `vi.mock('drizzle-orm')` suites (cron, waitlist, SMS
 * drafts, …) omit `sql` and used to crash on any import that pulled
 * signup-funnel.server → synthetic-traffic.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  // intentionally no `sql` export
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn(), select: vi.fn() } }));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(),
}));

describe('synthetic-traffic lazy sql fragments', () => {
  it('imports under a drizzle mock that omits sql', async () => {
    await expect(
      import('@/lib/acquisition/synthetic-traffic')
    ).resolves.toMatchObject({
      isSyntheticTraffic: expect.any(Function),
      realJourney: expect.any(Function),
      realJourneyJ: expect.any(Function),
    });
    await expect(
      import('@/lib/analytics/signup-funnel.server')
    ).resolves.toMatchObject({
      recordFunnelStep: expect.any(Function),
    });
  });
});
