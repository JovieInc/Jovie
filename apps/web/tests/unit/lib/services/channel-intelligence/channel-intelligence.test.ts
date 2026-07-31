import { describe, expect, it } from 'vitest';
import {
  answerChannelIntelligenceQuery,
  buildChannelIntelligenceReport,
  type ChannelVideoMetrics,
  classifyChannelIntelligenceIntent,
  computeChannelCorrelations,
  ctrTimesAvgViewDurationMinutes,
  rankVideosByWatchMinutesPerImpression,
  watchMinutesPerImpression,
} from '@/lib/services/channel-intelligence';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVideo(
  overrides: Partial<ChannelVideoMetrics> = {}
): ChannelVideoMetrics {
  return {
    videoId: 'vid_001',
    title: 'Test Video',
    thumbnailUrl: 'https://img.youtube.com/vi/vid_001/maxresdefault.jpg',
    publishedAt: '2024-06-01T00:00:00Z',
    impressions: 10_000,
    views: 500,
    watchMinutes: 2_000,
    ctr: 0.05,
    avgViewDurationSeconds: 240,
    reachTrend: 0.05,
    hasFace: true,
    hasText: false,
    topic: 'music',
    titleWordCount: 4,
    durationSeconds: 600,
    ...overrides,
  };
}

/**
 * Build a video with explicit WMPI via watchMinutes/impressions.
 * CTR and AVD are set independently so we can prove ranking ignores CTR-only.
 */
function makeVideoWithWmpi(
  videoId: string,
  title: string,
  wmpi: number,
  impressions: number,
  extra: Partial<ChannelVideoMetrics> = {}
): ChannelVideoMetrics {
  return makeVideo({
    videoId,
    title,
    impressions,
    watchMinutes: wmpi * impressions,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// watchMinutesPerImpression
// ---------------------------------------------------------------------------

describe('watchMinutesPerImpression', () => {
  it('is watch_minutes / impressions when impressions > 0', () => {
    const m = makeVideo({ impressions: 200, watchMinutes: 100 });
    expect(watchMinutesPerImpression(m)).toBeCloseTo(0.5, 6);
  });

  it('falls back to CTR × AVD(minutes) when impressions are 0', () => {
    // CTR 0.10 × (180s / 60) = 0.30
    const m = makeVideo({
      impressions: 0,
      watchMinutes: 0,
      ctr: 0.1,
      avgViewDurationSeconds: 180,
    });
    expect(watchMinutesPerImpression(m)).toBeCloseTo(0.3, 6);
    expect(ctrTimesAvgViewDurationMinutes(m)).toBeCloseTo(0.3, 6);
  });

  it('returns 0 when no usable metrics', () => {
    expect(
      watchMinutesPerImpression(
        makeVideo({
          impressions: 0,
          watchMinutes: 0,
          ctr: 0,
          avgViewDurationSeconds: 0,
        })
      )
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ranking — NOT by CTR alone
// ---------------------------------------------------------------------------

describe('rankVideosByWatchMinutesPerImpression', () => {
  it('ranks by WMPI, not CTR (high-CTR short-watch loses to lower-CTR long-watch)', () => {
    // Clickbait: high CTR, low retention → low WMPI
    const clickbait = makeVideo({
      videoId: 'clickbait',
      title: 'You Will Not Believe This',
      impressions: 10_000,
      views: 1_500,
      watchMinutes: 500, // WMPI = 0.05
      ctr: 0.15, // high CTR
      avgViewDurationSeconds: 20,
    });

    // Slow start: lower CTR, deep retention → high WMPI
    const deep = makeVideo({
      videoId: 'deep',
      title: 'Full Production Breakdown',
      impressions: 10_000,
      views: 400,
      watchMinutes: 3_000, // WMPI = 0.30
      ctr: 0.04, // lower CTR
      avgViewDurationSeconds: 450,
    });

    const ranked = rankVideosByWatchMinutesPerImpression([clickbait, deep]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.videoId).toBe('deep');
    expect(ranked[1]?.videoId).toBe('clickbait');
    expect(ranked[0]!.watchMinutesPerImpression).toBeGreaterThan(
      ranked[1]!.watchMinutesPerImpression
    );
    // Guard: if we had sorted by CTR, clickbait would win — assert that did not happen
    expect(clickbait.ctr).toBeGreaterThan(deep.ctr);
  });

  it('excludes videos below the impression floor', () => {
    const ranked = rankVideosByWatchMinutesPerImpression([
      makeVideo({ videoId: 'tiny', impressions: 50, watchMinutes: 40 }),
      makeVideo({ videoId: 'ok', impressions: 500, watchMinutes: 100 }),
    ]);
    expect(ranked.map(v => v.videoId)).toEqual(['ok']);
  });

  it('assigns 1-based ranks in descending WMPI order', () => {
    const ranked = rankVideosByWatchMinutesPerImpression([
      makeVideoWithWmpi('a', 'A', 0.1, 1_000),
      makeVideoWithWmpi('b', 'B', 0.4, 1_000),
      makeVideoWithWmpi('c', 'C', 0.2, 1_000),
    ]);
    expect(ranked.map(v => v.videoId)).toEqual(['b', 'c', 'a']);
    expect(ranked.map(v => v.rank)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Correlations — face / text / topic / length
// ---------------------------------------------------------------------------

describe('computeChannelCorrelations', () => {
  it('surfaces face-in-thumbnail as a win when face videos have higher WMPI', () => {
    const videos: ChannelVideoMetrics[] = [];
    for (let i = 0; i < 5; i++) {
      videos.push(
        makeVideoWithWmpi(`face_${i}`, `Face ${i}`, 0.4, 2_000, {
          hasFace: true,
          hasText: false,
          topic: 'music',
          titleWordCount: 4,
          durationSeconds: 600,
        })
      );
      videos.push(
        makeVideoWithWmpi(`noface_${i}`, `No Face ${i}`, 0.2, 2_000, {
          hasFace: false,
          hasText: false,
          topic: 'music',
          titleWordCount: 4,
          durationSeconds: 600,
        })
      );
    }

    const signals = computeChannelCorrelations(videos);
    const face = signals.find(s => s.dimension === 'face');
    expect(face).toBeDefined();
    expect(face?.winningLabel).toMatch(/face/i);
    expect(face?.liftPercent).toBeGreaterThan(0);
    expect(face?.source.kind).toBe('youtube_reporting_api');
  });

  it('surfaces topic correlation when one topic clearly leads', () => {
    const videos: ChannelVideoMetrics[] = [];
    for (let i = 0; i < 4; i++) {
      videos.push(
        makeVideoWithWmpi(`live_${i}`, `Live ${i}`, 0.5, 2_000, {
          topic: 'live',
          hasFace: null,
          hasText: null,
        })
      );
      videos.push(
        makeVideoWithWmpi(`studio_${i}`, `Studio ${i}`, 0.2, 2_000, {
          topic: 'studio',
          hasFace: null,
          hasText: null,
        })
      );
    }

    const signals = computeChannelCorrelations(videos);
    const topic = signals.find(s => s.dimension === 'topic');
    expect(topic).toBeDefined();
    expect(topic?.winningLabel?.toLowerCase()).toContain('live');
  });
});

// ---------------------------------------------------------------------------
// Report + chat answers with sources
// ---------------------------------------------------------------------------

describe('buildChannelIntelligenceReport', () => {
  it('builds best/worst/declining lists and sources', () => {
    const videos = [
      makeVideoWithWmpi('best', 'Best', 0.5, 5_000, { reachTrend: 0.1 }),
      makeVideoWithWmpi('mid', 'Mid', 0.25, 5_000, { reachTrend: 0 }),
      makeVideoWithWmpi('worst', 'Worst', 0.05, 5_000, {
        reachTrend: -0.3,
      }),
    ];

    const report = buildChannelIntelligenceReport({
      channelId: 'UC_test',
      videos,
      windowStart: '2026-07-01T00:00:00Z',
      windowEnd: '2026-07-28T00:00:00Z',
      nowIso: '2026-07-28T12:00:00Z',
    });

    expect(report.channelId).toBe('UC_test');
    expect(report.bestVideos[0]?.videoId).toBe('best');
    expect(report.worstVideos[0]?.videoId).toBe('worst');
    expect(report.decliningVideos.map(v => v.videoId)).toContain('worst');
    expect(report.sources.some(s => s.kind === 'youtube_reporting_api')).toBe(
      true
    );
    expect(report.sources.some(s => s.kind === 'derived')).toBe(true);
  });
});

describe('classifyChannelIntelligenceIntent', () => {
  it.each([
    ['what are my best videos?', 'best_videos'],
    ['show my top videos', 'best_videos'],
    ['what are my worst videos', 'worst_videos'],
    ["what's working on my channel?", 'whats_working'],
    ['what works for packaging?', 'whats_working'],
    ["what's declining?", 'whats_declining'],
    ['which videos are dropping reach', 'whats_declining'],
    ['hello there', 'unknown'],
  ] as const)('%s → %s', (question, intent) => {
    expect(classifyChannelIntelligenceIntent(question)).toBe(intent);
  });
});

describe('answerChannelIntelligenceQuery', () => {
  const report = buildChannelIntelligenceReport({
    channelId: 'UC_test',
    videos: [
      makeVideoWithWmpi('best', 'Hit Single Visualizer', 0.6, 8_000, {
        hasFace: true,
        hasText: false,
        topic: 'music',
        titleWordCount: 3,
        reachTrend: 0.2,
      }),
      makeVideoWithWmpi('ok', 'Studio Tour', 0.3, 4_000, {
        hasFace: true,
        hasText: true,
        topic: 'vlog',
        titleWordCount: 2,
        reachTrend: -0.05,
      }),
      makeVideoWithWmpi('weak', 'Random Clip Dump', 0.08, 3_000, {
        hasFace: false,
        hasText: true,
        topic: 'vlog',
        titleWordCount: 12,
        reachTrend: -0.25,
      }),
      // pad for correlation min sample
      ...[0, 1, 2].map(i =>
        makeVideoWithWmpi(`face_pad_${i}`, `Face Pad ${i}`, 0.55, 2_000, {
          hasFace: true,
          hasText: false,
          topic: 'music',
          titleWordCount: 3,
        })
      ),
      ...[0, 1, 2].map(i =>
        makeVideoWithWmpi(`noface_pad_${i}`, `NoFace Pad ${i}`, 0.12, 2_000, {
          hasFace: false,
          hasText: true,
          topic: 'vlog',
          titleWordCount: 11,
        })
      ),
    ],
    nowIso: '2026-07-28T12:00:00Z',
  });

  it('answers best-videos with ranked list and sources', () => {
    const answer = answerChannelIntelligenceQuery({
      question: 'what are my best videos?',
      report,
    });
    expect(answer.intent).toBe('best_videos');
    expect(answer.rankedVideos[0]?.videoId).toBe('best');
    expect(answer.summary).toMatch(/watch-min/i);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(
      answer.sources.some(
        s =>
          s.kind === 'youtube_reporting_api' ||
          s.kind === 'derived' ||
          s.metricKeys.includes('watch_minutes_per_impression')
      )
    ).toBe(true);
  });

  it('answers whats-working with channel correlations and sources', () => {
    const answer = answerChannelIntelligenceQuery({
      question: "what's working?",
      report,
    });
    expect(answer.intent).toBe('whats_working');
    expect(answer.winSignals.length).toBeGreaterThan(0);
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it('answers declining with reach-trend videos and sources', () => {
    const answer = answerChannelIntelligenceQuery({
      question: "what's declining?",
      report,
    });
    expect(answer.intent).toBe('whats_declining');
    expect(answer.rankedVideos.some(v => v.videoId === 'weak')).toBe(true);
    expect(answer.sources.length).toBeGreaterThan(0);
  });
});
