import { describe, expect, it } from 'vitest';
import {
  buildChallengerSets,
  buildRevivalQueue,
  classifyUnderperformer,
  DECLINING_REACH_THRESHOLD,
  HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR,
  MIN_IMPRESSIONS_FOR_REVIVAL,
  scoreOpportunity,
  scoreVideo,
  WATCH_MIN_BASELINE_FACTOR,
} from '@/lib/services/youtube-revival/queue';
import type {
  ChannelBaseline,
  VideoMetrics,
} from '@/lib/services/youtube-revival/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASELINE: ChannelBaseline = {
  trafficSource: 'browse_features',
  medianCtr: 0.05, // 5 % median CTR
  medianWatchMinPerImpression: 0.3, // 0.3 watch-min per impression
};

function makeVideo(overrides: Partial<VideoMetrics> = {}): VideoMetrics {
  return {
    videoId: 'vid_001',
    title: 'Test Video',
    thumbnailUrl: 'https://img.youtube.com/vi/vid_001/maxresdefault.jpg',
    publishedAt: '2024-01-01T00:00:00Z',
    trafficSource: 'browse_features',
    impressions: 50_000,
    ctr: 0.06, // above median → healthy
    views: 3_000,
    watchMinutes: 18_000, // 0.36 watch-min/impression → above baseline
    reachTrend: 0.05, // slight growth
    isEvergreen: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyUnderperformer
// ---------------------------------------------------------------------------

describe('classifyUnderperformer', () => {
  it('returns no flags for a healthy video', () => {
    const flags = classifyUnderperformer(makeVideo(), BASELINE);
    expect(flags).toHaveLength(0);
  });

  it('flags ctr_below_median when CTR < median', () => {
    const flags = classifyUnderperformer(makeVideo({ ctr: 0.03 }), BASELINE);
    expect(flags).toContain('ctr_below_median');
  });

  it('flags watch_min_per_impression_below_baseline when ratio is too low', () => {
    // 50 000 impressions, 10 000 watch-min → 0.2 wmpI
    // baseline = 0.3, factor = 0.8 → threshold = 0.24
    const flags = classifyUnderperformer(
      makeVideo({ watchMinutes: 10_000 }),
      BASELINE
    );
    expect(flags).toContain('watch_min_per_impression_below_baseline');
  });

  it('does not flag watch_min when baseline is zero', () => {
    const zeroBaseline: ChannelBaseline = {
      ...BASELINE,
      medianWatchMinPerImpression: 0,
    };
    const flags = classifyUnderperformer(makeVideo(), zeroBaseline);
    expect(flags).not.toContain('watch_min_per_impression_below_baseline');
  });

  it('flags high_impressions_low_views when CTR is < 0.5 × median', () => {
    // 0.5 × 0.05 = 0.025; set CTR = 0.02
    const flags = classifyUnderperformer(makeVideo({ ctr: 0.02 }), BASELINE);
    expect(flags).toContain('high_impressions_low_views');
  });

  it('flags evergreen_declining_reach for evergreen videos with declining reach', () => {
    const flags = classifyUnderperformer(
      makeVideo({ isEvergreen: true, reachTrend: -0.2 }),
      BASELINE
    );
    expect(flags).toContain('evergreen_declining_reach');
  });

  it('does not flag evergreen_declining_reach for non-evergreen videos', () => {
    const flags = classifyUnderperformer(
      makeVideo({ isEvergreen: false, reachTrend: -0.5 }),
      BASELINE
    );
    expect(flags).not.toContain('evergreen_declining_reach');
  });

  it('does not flag declining reach when trend is at the threshold boundary', () => {
    // Exactly at threshold should NOT fire (strictly <)
    const flags = classifyUnderperformer(
      makeVideo({ isEvergreen: true, reachTrend: DECLINING_REACH_THRESHOLD }),
      BASELINE
    );
    expect(flags).not.toContain('evergreen_declining_reach');
  });

  it('skips videos below the minimum impressions threshold', () => {
    const flags = classifyUnderperformer(
      makeVideo({
        impressions: MIN_IMPRESSIONS_FOR_REVIVAL - 1,
        ctr: 0.001, // would normally trigger many flags
        reachTrend: -1,
        isEvergreen: true,
      }),
      BASELINE
    );
    expect(flags).toHaveLength(0);
  });

  it('can fire multiple flags simultaneously', () => {
    const flags = classifyUnderperformer(
      makeVideo({
        ctr: 0.01, // below median AND below 0.5×median
        watchMinutes: 5_000, // very low wmpI
        isEvergreen: true,
        reachTrend: -0.3,
      }),
      BASELINE
    );
    expect(flags).toContain('ctr_below_median');
    expect(flags).toContain('watch_min_per_impression_below_baseline');
    expect(flags).toContain('high_impressions_low_views');
    expect(flags).toContain('evergreen_declining_reach');
    expect(flags).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// scoreOpportunity
// ---------------------------------------------------------------------------

describe('scoreOpportunity', () => {
  it('returns 0 for an empty flag set', () => {
    expect(scoreOpportunity([])).toBe(0);
  });

  it('sums flag weights correctly', () => {
    // ctr_below_median=25 + watch_min=25 = 50
    expect(
      scoreOpportunity([
        'ctr_below_median',
        'watch_min_per_impression_below_baseline',
      ])
    ).toBe(50);
  });

  it('caps at 100 when all flags fire', () => {
    const score = scoreOpportunity([
      'ctr_below_median',
      'watch_min_per_impression_below_baseline',
      'high_impressions_low_views',
      'evergreen_declining_reach',
    ]);
    expect(score).toBe(100);
  });

  it('includes high_impressions_low_views weight of 30', () => {
    expect(scoreOpportunity(['high_impressions_low_views'])).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// buildChallengerSets
// ---------------------------------------------------------------------------

describe('buildChallengerSets', () => {
  it('returns face + title_hook challengers when CTR is below median', () => {
    const challengers = buildChallengerSets(['ctr_below_median']);
    const elements = challengers.map(c => c.packagingElement);
    expect(elements).toContain('face');
    expect(elements).toContain('title_hook');
  });

  it('returns color challenger for evergreen_declining_reach', () => {
    const challengers = buildChallengerSets(['evergreen_declining_reach']);
    expect(challengers.some(c => c.packagingElement === 'color')).toBe(true);
  });

  it('returns combined challenger for isolated watch_min flag', () => {
    const challengers = buildChallengerSets([
      'watch_min_per_impression_below_baseline',
    ]);
    expect(challengers.some(c => c.packagingElement === 'combined')).toBe(true);
  });

  it('deduplicates packaging elements across flags', () => {
    // Both ctr_below_median and high_impressions_low_views produce face+title
    const challengers = buildChallengerSets([
      'ctr_below_median',
      'high_impressions_low_views',
    ]);
    const elements = challengers.map(c => c.packagingElement);
    const uniqueElements = new Set(elements);
    expect(elements.length).toBe(uniqueElements.size);
  });

  it('returns empty array for empty flag set', () => {
    expect(buildChallengerSets([])).toHaveLength(0);
  });

  it('each challenger has a non-empty hypothesis and rationale', () => {
    const challengers = buildChallengerSets([
      'ctr_below_median',
      'evergreen_declining_reach',
    ]);
    for (const c of challengers) {
      expect(c.hypothesis.length).toBeGreaterThan(0);
      expect(c.rationale.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// scoreVideo
// ---------------------------------------------------------------------------

describe('scoreVideo', () => {
  it('returns null for a healthy video', () => {
    expect(scoreVideo(makeVideo(), BASELINE)).toBeNull();
  });

  it('returns a RevivalCandidate for an underperformer', () => {
    const candidate = scoreVideo(makeVideo({ ctr: 0.02 }), BASELINE);
    expect(candidate).not.toBeNull();
    expect(candidate?.videoId).toBe('vid_001');
  });

  it('includes watchMinPerImpression in the metrics snapshot', () => {
    // 50 000 impressions, 10 000 watch-min → 0.2
    const candidate = scoreVideo(makeVideo({ watchMinutes: 10_000 }), BASELINE);
    expect(candidate?.metrics.watchMinPerImpression).toBeCloseTo(0.2);
  });

  it('opportunityScore is > 0 when any flag fires', () => {
    const candidate = scoreVideo(makeVideo({ ctr: 0.03 }), BASELINE);
    expect(candidate?.opportunityScore ?? 0).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildRevivalQueue
// ---------------------------------------------------------------------------

describe('buildRevivalQueue', () => {
  const videos: VideoMetrics[] = [
    makeVideo({
      videoId: 'high',
      ctr: 0.01,
      reachTrend: -0.3,
      isEvergreen: true,
      watchMinutes: 3_000,
    }),
    makeVideo({ videoId: 'medium', ctr: 0.03 }), // only ctr_below_median
    makeVideo({ videoId: 'healthy', ctr: 0.07 }), // healthy
  ];

  it('excludes healthy videos', () => {
    const queue = buildRevivalQueue(videos, [BASELINE]);
    const ids = queue.map(c => c.videoId);
    expect(ids).not.toContain('healthy');
  });

  it('sorts candidates by opportunityScore descending', () => {
    const queue = buildRevivalQueue(videos, [BASELINE]);
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].opportunityScore).toBeGreaterThanOrEqual(
        queue[i].opportunityScore
      );
    }
  });

  it('returns empty array when no videos qualify', () => {
    const queue = buildRevivalQueue([makeVideo({ ctr: 0.1 })], [BASELINE]);
    expect(queue).toHaveLength(0);
  });

  it('skips videos without a matching baseline', () => {
    const searchVideo = makeVideo({ trafficSource: 'search', ctr: 0.01 });
    // Only browse_features baseline provided
    const queue = buildRevivalQueue([searchVideo], [BASELINE]);
    expect(queue).toHaveLength(0);
  });

  it('handles multiple traffic source baselines correctly', () => {
    const searchBaseline: ChannelBaseline = {
      trafficSource: 'search',
      medianCtr: 0.08,
      medianWatchMinPerImpression: 0.4,
    };
    const searchVideo = makeVideo({
      videoId: 'search_under',
      trafficSource: 'search',
      ctr: 0.02, // below search median
    });
    const queue = buildRevivalQueue([searchVideo], [searchBaseline]);
    expect(queue).toHaveLength(1);
    expect(queue[0].videoId).toBe('search_under');
  });

  it('handles empty video list gracefully', () => {
    expect(buildRevivalQueue([], [BASELINE])).toHaveLength(0);
  });

  it('handles empty baseline list gracefully', () => {
    expect(buildRevivalQueue([makeVideo({ ctr: 0.01 })], [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('MIN_IMPRESSIONS_FOR_REVIVAL is a positive integer', () => {
    expect(MIN_IMPRESSIONS_FOR_REVIVAL).toBeGreaterThan(0);
    expect(Number.isInteger(MIN_IMPRESSIONS_FOR_REVIVAL)).toBe(true);
  });

  it('WATCH_MIN_BASELINE_FACTOR is in (0, 1)', () => {
    expect(WATCH_MIN_BASELINE_FACTOR).toBeGreaterThan(0);
    expect(WATCH_MIN_BASELINE_FACTOR).toBeLessThan(1);
  });

  it('HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR is in (0, 1)', () => {
    expect(HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR).toBeGreaterThan(0);
    expect(HIGH_IMPRESSION_LOW_VIEW_CTR_FACTOR).toBeLessThan(1);
  });

  it('DECLINING_REACH_THRESHOLD is negative', () => {
    expect(DECLINING_REACH_THRESHOLD).toBeLessThan(0);
  });
});
