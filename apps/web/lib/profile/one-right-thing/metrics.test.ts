import { describe, expect, it } from 'vitest';
import {
  buildFeaturedReport,
  FEATURED_MIN_IMPRESSIONS,
  parseFeaturedExtras,
} from './metrics';

describe('parseFeaturedExtras', () => {
  it('accepts only values the engine can produce', () => {
    expect(
      parseFeaturedExtras({
        featured_kind: 'show',
        featured_reason: 'stale_release_show_soon',
        featured_channel: 'social',
        featured_source: 'instagram',
      })
    ).toEqual({
      kind: 'show',
      reason: 'stale_release_show_soon',
      channel: 'social',
    });
  });

  it('rejects unknown, missing or injected values', () => {
    const ok = {
      featured_kind: 'release',
      featured_reason: 'fresh_release',
      featured_channel: 'dsp',
    };
    expect(parseFeaturedExtras(undefined)).toBeNull();
    expect(parseFeaturedExtras({ ...ok, featured_kind: 'ad' })).toBeNull();
    expect(
      parseFeaturedExtras({ ...ok, featured_reason: "x'; DROP TABLE y;--" })
    ).toBeNull();
    expect(parseFeaturedExtras({ ...ok, featured_channel: 5 })).toBeNull();
    expect(parseFeaturedExtras({ featured_kind: 'release' })).toBeNull();
  });
});

describe('buildFeaturedReport', () => {
  it('merges rows per kind and reason and hides rates below the sample floor', () => {
    const report = buildFeaturedReport([
      { kind: 'release', reason: 'fresh_release', impressions: 80, taps: 8 },
      { kind: 'release', reason: 'fresh_release', impressions: 120, taps: 20 },
      { kind: 'show', reason: 'default_show', impressions: 10, taps: 5 },
    ]);
    expect(report[0]).toMatchObject({
      reason: 'fresh_release',
      impressions: 200,
      taps: 28,
      underpowered: false,
    });
    expect(report[0]?.tapRate).toBeCloseTo(0.14);
    expect(report[1]).toMatchObject({ underpowered: true, tapRate: null });
    expect(FEATURED_MIN_IMPRESSIONS).toBe(100);
  });
});
