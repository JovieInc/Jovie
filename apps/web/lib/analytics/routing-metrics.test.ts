import { describe, expect, it } from 'vitest';
import { percentile, summarizeRoutingMetrics } from './routing-metrics';

describe('summarizeRoutingMetrics', () => {
  it('computes p50/p95 and correct-storefront rate', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      provider: 'apple_music',
      ttdMs: (i + 1) * 100,
      storefront: i < 18 ? 'jp' : 'us',
      visitorCountry: 'jp',
    }));
    const m = summarizeRoutingMetrics(rows);
    expect(m.ttdP50Ms).toBe(1000);
    expect(m.ttdP95Ms).toBe(1900);
    expect(m.correctStorefrontRate).toBeCloseTo(0.9);
  });

  it('is null-safe on empty and non-apple rows', () => {
    expect(summarizeRoutingMetrics([])).toMatchObject({
      clicks: 0,
      ttdP50Ms: null,
      correctStorefrontRate: null,
    });
    expect(
      summarizeRoutingMetrics([{ provider: 'spotify', ttdMs: 5 }])
        .correctStorefrontRate
    ).toBeNull();
    expect(percentile([], 50)).toBeNull();
  });
});
