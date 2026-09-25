import { describe, expect, it } from 'vitest';
import {
  buildEvidenceReceiptSet,
  buildMetricReceipt,
  certifiedRateOrUnavailable,
  EVIDENCE_RECEIPT_CONTRACT_VERSION,
  type MetricReceipt,
  measuredAvailability,
  resolveEvidenceWindow,
} from '@/lib/analytics/evidence-receipt';
import { METRICS_CONTRACT_VERSION } from '@/lib/analytics/metrics';
import { MS_PER_DAY } from '@/lib/analytics/time-range';

/**
 * Deterministic fixtures for the JOV-6582 evidence-receipt contract.
 * All timestamps are fixed instants — no `new Date()` inside tests.
 */

const NOW = new Date('2026-09-24T12:00:00.000Z');
const START_7D = new Date(NOW.getTime() - 7 * MS_PER_DAY);

function context(
  overrides: Partial<Parameters<typeof buildMetricReceipt>[1]> = {}
) {
  return {
    profileId: 'profile-123',
    rangeEnd: NOW,
    resolvedRangeStart: START_7D,
    ...overrides,
  };
}

const window = resolveEvidenceWindow(NOW, START_7D);

describe('resolveEvidenceWindow', () => {
  it('resolves one window per request with inclusive start / exclusive end', () => {
    const w = resolveEvidenceWindow(NOW, START_7D, 'America/Los_Angeles');
    expect(w.start).toBe(START_7D.toISOString());
    expect(w.end).toBe(NOW.toISOString());
    expect(w.hours).toBe(168);
    expect(w.timezone).toBe('America/Los_Angeles');
  });

  it('midnight boundary: a window ending exactly at 00:00 UTC keeps elapsed-hour math exact', () => {
    const end = new Date('2026-09-25T00:00:00.000Z');
    const start = new Date(end.getTime() - 24 * 3_600_000);
    const w = resolveEvidenceWindow(end, start);
    expect(w.hours).toBe(24);
    expect(w.start).toBe('2026-09-24T00:00:00.000Z');
  });

  it('DST boundary: elapsed-hour length is fixed (no calendar-day drift)', () => {
    // US spring-forward 2026-03-08: calendar week has 167h, rolling window stays 168h.
    const end = new Date('2026-03-10T12:00:00.000Z');
    const start = new Date(end.getTime() - 7 * MS_PER_DAY);
    expect(resolveEvidenceWindow(end, start).hours).toBe(168);
  });

  it('unbounded range has null start and null hours', () => {
    const w = resolveEvidenceWindow(NOW, null);
    expect(w.start).toBeNull();
    expect(w.hours).toBeNull();
    expect(w.end).toBe(NOW.toISOString());
  });
});

describe('buildMetricReceipt', () => {
  it('carries metric identity verbatim from the canonical layer', () => {
    const receipt = buildMetricReceipt(
      {
        metric: 'profile_views',
        value: 42,
        grain: 'daily_bucket',
        availability: 'measured',
      },
      context(),
      window
    );

    expect(receipt.contract_version).toBe(EVIDENCE_RECEIPT_CONTRACT_VERSION);
    expect(receipt.definition_version).toBe(METRICS_CONTRACT_VERSION);
    expect(receipt.metric).toBe('profile_views');
    expect(receipt.unit).toBe('views');
    expect(receipt.source).toContain('daily_profile_views');
    expect(receipt.definition.length).toBeGreaterThan(0);
    expect(receipt.scope).toEqual({ profileId: 'profile-123' });
  });

  it('measured zero stays a measured zero (never unavailable)', () => {
    const receipt = buildMetricReceipt(
      {
        metric: 'total_clicks',
        value: 0,
        grain: 'event',
        availability: measuredAvailability(0),
      },
      context(),
      window
    );
    expect(receipt.value).toBe(0);
    expect(receipt.availability).toBe('measured_zero');
    expect(receipt.limitations).toEqual([]);
  });

  it('nonzero counts report measured, zero counts report measured_zero', () => {
    expect(measuredAvailability(0)).toBe('measured_zero');
    expect(measuredAvailability(7)).toBe('measured');
  });

  it('partial data and not-yet-mature states pass through typed', () => {
    const partial = buildMetricReceipt(
      {
        metric: 'total_clicks',
        value: 5,
        grain: 'event',
        availability: 'partial_data',
        limitations: ['partial_source'],
        limitationDetail: 'Click ingestion lagged 2h in this window.',
      },
      context(),
      window
    );
    expect(partial.availability).toBe('partial_data');
    expect(partial.limitations).toEqual(['partial_source']);

    const immature = buildMetricReceipt(
      {
        metric: 'capture_rate',
        value: 0,
        grain: 'event',
        availability: 'not_yet_mature',
        limitations: ['not_mature'],
      },
      context(),
      window
    );
    expect(immature.availability).toBe('not_yet_mature');
  });

  it('missing source: value present but typed unavailable, never a confident zero', () => {
    const receipt = buildMetricReceipt(
      {
        metric: 'profile_views',
        value: 0,
        grain: 'daily_bucket',
        availability: 'unavailable',
        limitations: ['source_table_missing'],
        limitationDetail:
          'daily_profile_views source is missing; the reported value is NOT a measured zero.',
      },
      context(),
      window
    );
    expect(receipt.value).toBe(0);
    expect(receipt.availability).toBe('unavailable');
    expect(receipt.limitations).toContain('source_table_missing');
  });
});

describe('certifiedRateOrUnavailable', () => {
  it('certifies the rate only when both numerator and denominator are measured', () => {
    const receipt = certifiedRateOrUnavailable(
      'capture_rate',
      4,
      80,
      context(),
      window
    );
    expect(receipt.value).toBe(5);
    expect(receipt.numerator).toBe(4);
    expect(receipt.denominator).toBe(80);
    expect(receipt.availability).toBe('measured');
  });

  it('unknown denominator never produces a certified rate', () => {
    const receipt = certifiedRateOrUnavailable(
      'ctr',
      12,
      null,
      context(),
      window
    );
    expect(receipt.availability).toBe('unavailable');
    expect(receipt.limitations).toContain('unknown_denominator');
    expect(receipt.numerator).toBeUndefined();
    expect(receipt.denominator).toBeUndefined();
  });

  it('zero numerator with measured denominator is a measured zero rate', () => {
    const receipt = certifiedRateOrUnavailable(
      'ctr',
      0,
      150,
      context(),
      window
    );
    expect(receipt.value).toBe(0);
    expect(receipt.availability).toBe('measured_zero');
  });
});

describe('buildEvidenceReceiptSet', () => {
  it('shares one window/as-of/computed_at across all metric receipts', () => {
    const computedAt = new Date('2026-09-24T11:59:00.000Z');
    const receipts: MetricReceipt[] = [
      buildMetricReceipt(
        {
          metric: 'profile_views',
          value: 10,
          grain: 'daily_bucket',
          availability: 'measured',
        },
        context({ computedAt }),
        window
      ),
      buildMetricReceipt(
        {
          metric: 'total_clicks',
          value: 3,
          grain: 'event',
          availability: 'measured',
        },
        context({ computedAt }),
        window
      ),
    ];
    const set = buildEvidenceReceiptSet(
      receipts,
      context({ computedAt, fromCache: true })
    );

    expect(set.contract_version).toBe(EVIDENCE_RECEIPT_CONTRACT_VERSION);
    expect(set.window).toEqual(window);
    expect(set.as_of).toBe(NOW.toISOString());
    expect(set.computed_at).toBe(computedAt.toISOString());
    expect(set.from_cache).toBe(true);
    expect(set.metrics).toHaveLength(2);
    for (const receipt of set.metrics) {
      expect(receipt.window).toEqual(window);
    }
  });

  it('cached data keeps its compute time and never claims a newer watermark', () => {
    // Watermark at compute time is carried forward; a cache layer must not
    // advance as_of beyond what the cached values actually saw.
    const computedAt = new Date('2026-09-24T10:00:00.000Z');
    const staleWatermark = new Date('2026-09-24T09:58:00.000Z');
    const receipt = buildMetricReceipt(
      {
        metric: 'profile_views',
        value: 10,
        grain: 'daily_bucket',
        availability: 'measured',
      },
      context({ computedAt, sourceWatermark: staleWatermark, fromCache: true }),
      window
    );
    expect(receipt.as_of).toBe(staleWatermark.toISOString());
    expect(receipt.computed_at).toBe(computedAt.toISOString());
    expect(receipt.computed_at < receipt.as_of === false).toBe(true);
    expect(receipt.from_cache).toBe(true);
  });

  it('timezone is recorded verbatim (no calendar-day regrouping is claimed)', () => {
    const set = buildEvidenceReceiptSet(
      [],
      context({ timezone: 'Pacific/Auckland' })
    );
    expect(set.window.timezone).toBe('Pacific/Auckland');
  });

  it('incompatible grain is explicit on the receipt (daily source, intraday ask)', () => {
    const receipt = buildMetricReceipt(
      {
        metric: 'profile_views',
        value: 100,
        grain: 'daily_bucket',
        availability: 'measured',
        limitations: ['source_grain_daily'],
        limitationDetail:
          'Source buckets per calendar day; intraday precision is not claimed.',
      },
      context(),
      window
    );
    expect(receipt.grain).toBe('daily_bucket');
    expect(receipt.limitations).toContain('source_grain_daily');
  });
});
