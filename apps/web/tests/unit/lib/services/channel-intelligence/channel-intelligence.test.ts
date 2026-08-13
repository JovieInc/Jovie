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

function makeVideo(
  overrides: Partial<ChannelVideoMetrics> = {}
): ChannelVideoMetrics {
  return {
    videoId: 'vid_001',
    title: 'Test Video',
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

describe('watchMinutesPerImpression', () => {
  it('uses watch_minutes / impressions, or CTR × AVD minutes as fallback', () => {
    expect(
      watchMinutesPerImpression(
        makeVideo({ impressions: 200, watchMinutes: 100 })
      )
    ).toBeCloseTo(0.5, 6);
    // CTR 0.10 × (180s / 60) = 0.30
    expect(
      watchMinutesPerImpression(
        makeVideo({
          impressions: 0,
          watchMinutes: 0,
          ctr: 0.1,
          avgViewDurationSeconds: 180,
        })
      )
    ).toBeCloseTo(0.3, 6);
    expect(
      ctrTimesAvgViewDurationMinutes(
        makeVideo({ ctr: 0.1, avgViewDurationSeconds: 180 })
      )
    ).toBeCloseTo(0.3, 6);
  });
});

describe('rankVideosByWatchMinutesPerImpression', () => {
  it('ranks by WMPI not CTR and drops sub-floor impressions', () => {
    const clickbait = makeVideo({
      videoId: 'clickbait',
      impressions: 10_000,
      watchMinutes: 500, // WMPI 0.05
      ctr: 0.15,
      avgViewDurationSeconds: 20,
    });
    const deep = makeVideo({
      videoId: 'deep',
      impressions: 10_000,
      watchMinutes: 3_000, // WMPI 0.30
      ctr: 0.04,
      avgViewDurationSeconds: 450,
    });
    const ranked = rankVideosByWatchMinutesPerImpression([
      clickbait,
      deep,
      makeVideo({ videoId: 'tiny', impressions: 50, watchMinutes: 40 }),
    ]);
    expect(ranked.map(v => v.videoId)).toEqual(['deep', 'clickbait']);
    expect(clickbait.ctr).toBeGreaterThan(deep.ctr);
  });
});

describe('computeChannelCorrelations', () => {
  it('surfaces face and topic wins on this channel', () => {
    const videos: ChannelVideoMetrics[] = [];
    for (let i = 0; i < 5; i++) {
      videos.push(
        makeVideoWithWmpi(`face_${i}`, `Face ${i}`, 0.4, 2_000, {
          hasFace: true,
          topic: 'live',
        }),
        makeVideoWithWmpi(`noface_${i}`, `No Face ${i}`, 0.2, 2_000, {
          hasFace: false,
          topic: 'studio',
        })
      );
    }
    const signals = computeChannelCorrelations(videos);
    const face = signals.find(s => s.dimension === 'face');
    expect(face?.winningLabel).toMatch(/face/i);
    expect(face?.source.kind).toBe('youtube_reporting_api');
    const topic = signals.find(s => s.dimension === 'topic');
    expect(topic?.winningLabel?.toLowerCase()).toContain('live');
  });
});

describe('buildChannelIntelligenceReport + answers', () => {
  const report = buildChannelIntelligenceReport({
    channelId: 'UC_test',
    videos: [
      makeVideoWithWmpi('best', 'Hit Single', 0.6, 8_000, {
        hasFace: true,
        hasText: false,
        topic: 'music',
        reachTrend: 0.2,
      }),
      makeVideoWithWmpi('mid', 'Studio Tour', 0.3, 4_000, {
        hasFace: true,
        hasText: true,
        topic: 'vlog',
        reachTrend: 0,
      }),
      makeVideoWithWmpi('weak', 'Random Dump', 0.08, 3_000, {
        hasFace: false,
        hasText: true,
        topic: 'vlog',
        reachTrend: -0.25,
        ctr: 0.02,
        avgViewDurationSeconds: 20,
      }),
      ...[0, 1, 2].map(i =>
        makeVideoWithWmpi(`face_${i}`, `Face ${i}`, 0.55, 2_000, {
          hasFace: true,
          topic: 'music',
        })
      ),
      ...[0, 1, 2].map(i =>
        makeVideoWithWmpi(`noface_${i}`, `NoFace ${i}`, 0.12, 2_000, {
          hasFace: false,
          topic: 'vlog',
        })
      ),
    ],
    nowIso: '2026-07-28T12:00:00Z',
  });

  it('builds ranked lists with Reporting API sources', () => {
    expect(report.bestVideos[0]?.videoId).toBe('best');
    expect(report.worstVideos[0]?.videoId).toBe('weak');
    expect(report.decliningVideos.map(v => v.videoId)).toContain('weak');
    expect(report.sources.some(s => s.kind === 'youtube_reporting_api')).toBe(
      true
    );
    expect(report.changePlan.length).toBeGreaterThan(0);
    expect(report.changePlan[0]?.priority).toBe(1);
    expect(
      report.changePlan.some(item => item.action.includes('Random Dump'))
    ).toBe(true);
    expect(report.changePlan.every(item => item.observation.length > 0)).toBe(
      true
    );
  });

  it.each([
    ['what are my best videos?', 'best_videos'],
    ['what are my worst videos', 'worst_videos'],
    ["what's working?", 'whats_working'],
    ["what's declining?", 'whats_declining'],
    ['hello', 'unknown'],
  ] as const)('classifies %s → %s', (q, intent) => {
    expect(classifyChannelIntelligenceIntent(q)).toBe(intent);
  });

  it('answers best / working / declining with sources', () => {
    const best = answerChannelIntelligenceQuery({
      question: 'what are my best videos?',
      report,
    });
    expect(best.intent).toBe('best_videos');
    expect(best.rankedVideos[0]?.videoId).toBe('best');
    expect(best.sources.length).toBeGreaterThan(0);

    const working = answerChannelIntelligenceQuery({
      question: "what's working?",
      report,
    });
    expect(working.intent).toBe('whats_working');
    expect(working.winSignals.length).toBeGreaterThan(0);
    expect(working.summary).toContain('Prioritized change plan');

    const declining = answerChannelIntelligenceQuery({
      question: "what's declining?",
      report,
    });
    expect(declining.rankedVideos.some(v => v.videoId === 'weak')).toBe(true);
  });
});
