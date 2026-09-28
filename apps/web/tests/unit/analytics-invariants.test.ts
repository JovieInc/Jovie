import { describe, expect, it } from 'vitest';
import {
  AnalyticsInvariantError,
  type AnalyticsWindowSnapshot,
  type AttributionAllocation,
  assertAnalyticsInvariants,
  findAnalyticsInvariantViolations,
  findAttributionOvercredit,
  formatInvariantFinding,
  type MetricEntry,
} from '@/lib/analytics/invariants';
import { evaluateDashboardAnalyticsInvariants } from '@/lib/analytics/invariants-runtime';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function count(
  value: number,
  coverage: 'complete' | 'unknown' = 'complete'
): MetricEntry {
  return {
    key: 'clicks',
    reading: { state: 'measured', value },
    grain: {
      population: 'link-clicks',
      identityBasis: 'event',
      windowBasis: 'ranged',
      coverage,
      additive: true,
    },
  };
}

function windowWith(
  metrics: readonly MetricEntry[],
  windowId = 'w1',
  parentWindowId?: string
): AnalyticsWindowSnapshot {
  return { windowId, parentWindowId, metrics };
}

// ---------------------------------------------------------------------------
// Valid edge cases the corrected invariants must ACCEPT (no fabrication)
// ---------------------------------------------------------------------------

describe('valid behaviors that must not be flagged', () => {
  it('accepts total clicks exceeding profile views (repeated clicks, direct-link entry)', () => {
    // The canonical corrected case: profile_views=0, total_clicks=4 is a
    // discrepancy to investigate, never proof of an impossible funnel.
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            key: 'profile_views',
            reading: { state: 'measured', value: 10 },
            grain: {
              population: 'profile-views',
              identityBasis: 'event',
              windowBasis: 'ranged',
              coverage: 'complete',
              additive: true,
            },
          },
          { ...count(40, 'complete'), key: 'total_clicks' },
        ]),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('accepts clicks>views even with zero views (incomplete view ingestion is not zero-fabricated)', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            key: 'profile_views',
            reading: { state: 'partial', value: 0 },
            grain: {
              population: 'profile-views',
              identityBasis: 'event',
              windowBasis: 'ranged',
              coverage: 'partial',
              additive: true,
            },
          },
          { ...count(4), key: 'total_clicks' },
        ]),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid repeated-click funnels end to end', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            key: 'profile_views',
            reading: { state: 'measured', value: 100 },
            grain: {
              population: 'profile-views',
              identityBasis: 'event',
              windowBasis: 'ranged',
              coverage: 'complete',
              additive: true,
            },
          },
          { ...count(250), key: 'total_clicks' },
          { ...count(90), key: 'listen_clicks' },
        ]),
      ],
      subsetRelations: [{ parent: 'total_clicks', child: 'listen_clicks' }],
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Genuine same-grain violations
// ---------------------------------------------------------------------------

describe('genuine violations on real (non-zero) values', () => {
  it('flags a same-cohort subset violation even when every value is non-zero', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          { ...count(50), key: 'total_clicks' },
          { ...count(80), key: 'listen_clicks' },
        ]),
      ],
      subsetRelations: [{ parent: 'total_clicks', child: 'listen_clicks' }],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.invariant).toBe('subset-within-parent');
    expect(result.violations[0]?.observed).toEqual({
      listen_clicks: 80,
      total_clicks: 50,
    });
  });

  it('flags deduplicated unique counts exceeding their total within one cohort', () => {
    const dedup = (value: number, key: string): MetricEntry => ({
      key,
      reading: { state: 'measured', value },
      grain: {
        population: 'audience-identities',
        identityBasis: 'distinct-identity',
        windowBasis: 'ranged',
        coverage: 'complete',
        cohortId: 'profile-visitors',
        additive: false,
      },
    });
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([dedup(30, 'subscribers'), dedup(20, 'unique_users')]),
      ],
      conversionRates: [
        {
          rate: 'capture_rate',
          numerator: 'subscribers',
          denominator: 'unique_users',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.invariant).toBe('conversion-rate-bounded');
  });

  it('flags a rate outside [0, 100] on a plausible non-zero value', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            key: 'capture_rate',
            reading: { state: 'measured', value: 137.5 },
            grain: {
              population: 'derived',
              identityBasis: 'distinct-identity',
              windowBasis: 'ranged',
              coverage: 'complete',
              additive: false,
              valueType: 'rate',
            },
          },
        ]),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.invariant).toBe('conversion-rate-bounded');
  });

  it('flags negative count metrics but allows declared financial adjustments', () => {
    const negative = (key: string, allowsNegative: boolean): MetricEntry => ({
      key,
      reading: { state: 'measured', value: -5, allowsNegative },
      grain: {
        population: 'derived',
        identityBasis: 'event',
        windowBasis: 'ranged',
        coverage: 'complete',
        additive: true,
      },
    });
    const flagged = findAnalyticsInvariantViolations({
      windows: [windowWith([negative('clicks', false)])],
    });
    expect(flagged.ok).toBe(false);

    const adjustment = findAnalyticsInvariantViolations({
      windows: [windowWith([negative('refund_cents', true)])],
    });
    expect(adjustment.ok).toBe(true);
  });

  it('flags non-finite counts', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            ...count(Number.POSITIVE_INFINITY),
          },
        ]),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('flags a declared channel partition summing above its parent', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          { ...count(50), key: 'total_clicks' },
          { ...count(30), key: 'listen_clicks' },
          { ...count(30), key: 'social_clicks' },
        ]),
      ],
      channelPartitions: [
        {
          parent: 'total_clicks',
          channels: ['listen_clicks', 'social_clicks'],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.invariant).toBe('channel-partition-bounded');
  });

  it('flags nested-window monotonicity violations for additive counts', () => {
    const inner = count(120);
    const outer = count(100);
    const result = findAnalyticsInvariantViolations({
      windows: [windowWith([outer], '7d'), windowWith([inner], '1d', '7d')],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.invariant).toBe('range-monotonicity');
  });
});

// ---------------------------------------------------------------------------
// Refusals: cross-grain comparisons produce non-comparable, never violations
// ---------------------------------------------------------------------------

describe('cross-grain and incompatible comparisons are refused', () => {
  it('refuses to order lifetime vs ranged visitor counts (identity-grain mismatch)', () => {
    const lifetime: MetricEntry = {
      key: 'unique_users',
      reading: { state: 'measured', value: 500 },
      grain: {
        population: 'audience-identities',
        identityBasis: 'distinct-identity',
        windowBasis: 'rolling-to-date',
        coverage: 'complete',
        additive: false,
      },
    };
    const ranged: MetricEntry = {
      key: 'subscribers',
      reading: { state: 'measured', value: 400 },
      grain: {
        population: 'audience-identities',
        identityBasis: 'distinct-identity',
        windowBasis: 'ranged',
        coverage: 'complete',
        additive: false,
      },
    };
    const result = findAnalyticsInvariantViolations({
      windows: [windowWith([lifetime, ranged])],
      conversionRates: [
        {
          rate: 'capture_rate',
          numerator: 'subscribers',
          denominator: 'unique_users',
        },
      ],
    });
    // Not a violation — a refusal. Nothing fabricated, nothing clamped.
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.nonComparable).toHaveLength(1);
    expect(result.nonComparable[0]?.kind).toBe('non-comparable');
  });

  it('refuses distinct-count monotonicity across incompatible identity cohorts', () => {
    const inner: MetricEntry = {
      key: 'unique_users',
      reading: { state: 'measured', value: 90 },
      grain: {
        population: 'audience-identities',
        identityBasis: 'distinct-identity',
        windowBasis: 'ranged',
        coverage: 'complete',
        additive: false,
      },
    };
    const result = findAnalyticsInvariantViolations({
      windows: [windowWith([inner], '7d'), windowWith([inner], '1d', '7d')],
    });
    // Distinct counts are not additive — the nested-window comparison is
    // refused rather than asserted.
    expect(result.ok).toBe(true);
    expect(result.nonComparable[0]?.invariant).toBe('range-monotonicity');
  });

  it('refuses rate monotonicity across nested windows', () => {
    const rate: MetricEntry = {
      key: 'capture_rate',
      reading: { state: 'measured', value: 42 },
      grain: {
        population: 'derived',
        identityBasis: 'distinct-identity',
        windowBasis: 'ranged',
        coverage: 'complete',
        additive: false,
        valueType: 'rate',
      },
    };
    const result = findAnalyticsInvariantViolations({
      windows: [windowWith([rate], '7d'), windowWith([rate], '1d', '7d')],
    });
    expect(result.ok).toBe(true);
    expect(result.nonComparable[0]?.invariant).toBe('range-monotonicity');
  });
});

// ---------------------------------------------------------------------------
// Typed missing-data states
// ---------------------------------------------------------------------------

describe('typed missing-data states never become zero', () => {
  it('treats unknown, partial, unavailable and known-zero as distinct', () => {
    const states: MetricEntry['reading'][] = [
      { state: 'known-zero' },
      { state: 'unavailable' },
      { state: 'unreported' },
      { state: 'partial', value: 7 },
      { state: 'measured', value: 0 },
    ];
    // Every state is representable and none coerces to another.
    expect(new Set(states.map(s => s.state)).size).toBe(5);
  });

  it('skips unavailable values instead of judging them as zero', () => {
    const result = findAnalyticsInvariantViolations({
      windows: [
        windowWith([
          {
            key: 'total_clicks',
            reading: { state: 'unavailable' },
            grain: count(0).grain,
          },
          { ...count(12), key: 'listen_clicks' },
        ]),
      ],
      subsetRelations: [{ parent: 'total_clicks', child: 'listen_clicks' }],
    });
    // Missing parent = no assertion, no fabrication.
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('assertAnalyticsInvariants throws a structured error on violations', () => {
    try {
      assertAnalyticsInvariants({
        windows: [
          windowWith([
            { ...count(10), key: 'total_clicks' },
            { ...count(99), key: 'listen_clicks' },
          ]),
        ],
        subsetRelations: [{ parent: 'total_clicks', child: 'listen_clicks' }],
      });
      expect.unreachable('expected AnalyticsInvariantError');
    } catch (error) {
      expect(error).toBeInstanceOf(AnalyticsInvariantError);
      const invariantError = error as AnalyticsInvariantError;
      expect(invariantError.violations).toHaveLength(1);
      expect(formatInvariantFinding(invariantError.violations[0]!)).toContain(
        'subset-within-parent'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Attribution allocation (no overcredit; proxy money is not a receipt)
// ---------------------------------------------------------------------------

describe('attribution allocation', () => {
  const allocation = (
    overrides: Partial<AttributionAllocation>
  ): AttributionAllocation => ({
    sourceEventId: 'evt_1',
    sourceValue: 100,
    credited: [60, 40],
    exclusive: true,
    ...overrides,
  });

  it('accepts an exclusive allocation that exactly allocates the source event', () => {
    expect(findAttributionOvercredit([allocation({})])).toEqual([]);
  });

  it('flags overcrediting a shared source event', () => {
    const violations = findAttributionOvercredit([
      allocation({ credited: [80, 70] }),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.invariant).toBe('attribution-allocation-bounded');
  });

  it('does not treat observational or proxy credit as a verified receipt', () => {
    const violations = findAttributionOvercredit([
      allocation({ exclusive: false, credited: [500, 500] }),
    ]);
    expect(violations).toEqual([]);
  });

  it('flags a non-finite receipt value', () => {
    const violations = findAttributionOvercredit([
      allocation({ sourceValue: Number.NaN }),
    ]);
    expect(violations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Runtime bridge (dashboard payload → engine)
// ---------------------------------------------------------------------------

describe('evaluateDashboardAnalyticsInvariants', () => {
  it('accepts the corrected valid case: clicks above views', () => {
    const result = evaluateDashboardAnalyticsInvariants(
      { profile_views: 0, total_clicks: 4 },
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result?.ok ?? true).toBe(true);
  });

  it('accepts a healthy funnel', () => {
    const result = evaluateDashboardAnalyticsInvariants(
      {
        profile_views: 100,
        unique_users: 50,
        subscribers: 5,
        listen_clicks: 30,
        total_clicks: 80,
        identified_users: 20,
        capture_rate: 10,
      },
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result?.ok).toBe(true);
  });

  it('flags plausible-but-wrong non-zero data (listen clicks above total clicks)', () => {
    const result = evaluateDashboardAnalyticsInvariants(
      {
        profile_views: 100,
        unique_users: 50,
        subscribers: 5,
        listen_clicks: 120,
        total_clicks: 80,
        identified_users: 20,
        capture_rate: 10,
      },
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result?.ok).toBe(false);
    expect(
      result?.violations.some(v => v.metricKeys.includes('listen_clicks'))
    ).toBe(true);
  });

  it('treats absent payload fields as unreported, not zero', () => {
    // total_clicks absent: subset relation is skipped, not judged 0-vs-120.
    const result = evaluateDashboardAnalyticsInvariants(
      { profile_views: 100, listen_clicks: 120 },
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result?.ok).toBe(true);
  });

  it('returns null for an empty payload instead of asserting anything', () => {
    const result = evaluateDashboardAnalyticsInvariants(
      {},
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result).toBeNull();
  });

  it('refuses conversion ordering only when the cohort is shared (runtime declares it)', () => {
    const result = evaluateDashboardAnalyticsInvariants(
      { unique_users: 50, subscribers: 5, capture_rate: 10 },
      { profileId: 'profile-1', range: '7d' }
    );
    expect(result?.ok).toBe(true);
    expect(result?.nonComparable ?? []).toEqual([]);
  });
});
