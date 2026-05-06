import { describe, expect, it } from 'vitest';
import { deriveAudienceState } from '@/lib/audience/derive-state';

const NOW = Date.parse('2026-05-05T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

describe('deriveAudienceState', () => {
  it('returns rising as a neutral SSR placeholder when nowMs <= 0', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(1), intentLevel: 'high', visits: 99 },
        0
      )
    ).toBe('rising');
    expect(
      deriveAudienceState(
        { lastSeenAt: null, intentLevel: 'low', visits: 0 },
        -1
      )
    ).toBe('rising');
  });

  it('returns dormant when lastSeenAt is null', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: null, intentLevel: 'high', visits: 99 },
        NOW
      )
    ).toBe('dormant');
  });

  it('returns dormant when lastSeenAt is unparseable', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: 'not-a-date', intentLevel: 'high', visits: 5 },
        NOW
      )
    ).toBe('dormant');
  });

  it('returns dormant for fans last seen >14 days ago', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(15), intentLevel: 'high', visits: 99 },
        NOW
      )
    ).toBe('dormant');
  });

  it('returns high when intentLevel=high and recently active', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(1), intentLevel: 'high', visits: 1 },
        NOW
      )
    ).toBe('high');
  });

  it('returns rising for medium intent + recent (≤7d)', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(3), intentLevel: 'medium', visits: 1 },
        NOW
      )
    ).toBe('rising');
  });

  it('returns rising for low intent + ≥3 visits + recent', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(2), intentLevel: 'low', visits: 4 },
        NOW
      )
    ).toBe('rising');
  });

  it('returns dormant for low intent + 1 visit even if recent', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(1), intentLevel: 'low', visits: 1 },
        NOW
      )
    ).toBe('dormant');
  });

  it('returns dormant for medium intent + low visits past the rising window', () => {
    // Past the 7d window with low visits and medium intent: not enough signal
    // to keep them in rising. Frequent visitors stay rising — see the
    // "keeps frequent visitors as rising" test below.
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(10), intentLevel: 'medium', visits: 1 },
        NOW
      )
    ).toBe('dormant');
  });

  it('handles boundary at exactly 7 days as rising', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(7), intentLevel: 'medium', visits: 1 },
        NOW
      )
    ).toBe('rising');
  });

  it('handles boundary at exactly 14 days as dormant for low-intent fallback', () => {
    // 14d is the cutoff; >14 is dormant. At exactly 14, not high, not rising
    // (past 7d), low intent + 1 visit, so falls through to dormant.
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(14), intentLevel: 'low', visits: 1 },
        NOW
      )
    ).toBe('dormant');
  });

  it('high beats stale visits — recent high intent wins', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(2), intentLevel: 'high', visits: 1 },
        NOW
      )
    ).toBe('high');
  });

  it('cools high-intent fans to rising when last seen 8-14 days ago', () => {
    // Sentry-flagged: high intent past the recency window must not stay "high".
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(10), intentLevel: 'high', visits: 1 },
        NOW
      )
    ).toBe('rising');
  });

  it('keeps frequent visitors as rising in the 8-14 day gap', () => {
    expect(
      deriveAudienceState(
        { lastSeenAt: daysAgo(10), intentLevel: 'low', visits: 5 },
        NOW
      )
    ).toBe('rising');
  });
});
