import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { billingPeriodStart } from '@/lib/analytics/signup-replay.server';

describe('billingPeriodStart', () => {
  it('uses this month on or after the 24th', () => {
    expect(
      billingPeriodStart(new Date('2026-10-28T12:00:00Z')).toISOString()
    ).toBe('2026-10-24T00:00:00.000Z');
  });
  it('uses last month before the 24th, across a year boundary', () => {
    expect(
      billingPeriodStart(new Date('2027-01-05T00:00:00Z')).toISOString()
    ).toBe('2026-12-24T00:00:00.000Z');
  });
});
