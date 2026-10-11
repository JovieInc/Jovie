import { describe, expect, it } from 'vitest';
import {
  assertCanaryReceiptsFresh,
  CANARY_RECEIPT_MAX_AGE_MS,
  CanaryReceiptFreshnessError,
} from './receipt-freshness';

const now = new Date('2026-10-05T13:00:00.000Z');
const current = { runAt: now.toISOString() };
const reports = (auth = current, profile = current) => ({
  'auth-signup-onboarding': auth,
  'public-profile': profile,
});

describe('scheduled canary receipt freshness', () => {
  it('accepts both fresh receipts without changing a probe verdict', () => {
    const failedProbe = { ...current, pass: false };
    expect(assertCanaryReceiptsFresh(reports(failedProbe), now)).toEqual({
      checkedAt: now.toISOString(),
      receipts: [
        { id: 'auth-signup-onboarding', ...current },
        { id: 'public-profile', ...current },
      ],
    });
  });

  it('accepts the last millisecond before TTL expiry and bounded clock skew', () => {
    const recent = {
      runAt: new Date(
        now.getTime() - CANARY_RECEIPT_MAX_AGE_MS + 1
      ).toISOString(),
    };
    const skew = { runAt: new Date(now.getTime() + 60_000).toISOString() };
    expect(() =>
      assertCanaryReceiptsFresh(reports(recent, skew), now)
    ).not.toThrow();
  });

  it.each([
    ['invalid', 'not-a-date'],
    ['future', new Date(now.getTime() + 60_001).toISOString()],
    [
      'stale',
      new Date(now.getTime() - CANARY_RECEIPT_MAX_AGE_MS).toISOString(),
    ],
    [
      'stale',
      new Date(now.getTime() - CANARY_RECEIPT_MAX_AGE_MS - 1).toISOString(),
    ],
  ])('rejects an auth receipt that is %s', (reason, runAt) => {
    try {
      assertCanaryReceiptsFresh(reports({ runAt }), now);
      expect.fail('silent/invalid canary must fail the detector');
    } catch (error) {
      expect(error).toBeInstanceOf(CanaryReceiptFreshnessError);
      expect((error as CanaryReceiptFreshnessError).failures).toEqual([
        { id: 'auth-signup-onboarding', reason },
      ]);
    }
  });

  it('reports both expired Redis keys rather than inventing healthy zeroes', () => {
    expect(() =>
      assertCanaryReceiptsFresh(
        { 'auth-signup-onboarding': null, 'public-profile': null },
        now
      )
    ).toThrow(
      'Scheduled canary receipt unavailable: auth-signup-onboarding (missing), public-profile (missing)'
    );
  });

  it('detects public-profile silence independently', () => {
    expect(() =>
      assertCanaryReceiptsFresh(
        { 'auth-signup-onboarding': current, 'public-profile': null },
        now
      )
    ).toThrow('public-profile (missing)');
  });
});
