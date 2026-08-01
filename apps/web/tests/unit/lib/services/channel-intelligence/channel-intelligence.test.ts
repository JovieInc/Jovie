import { describe, expect, it } from 'vitest';
import {
  answerChannelQuestion,
  answerChannelQuestionFromText,
  buildChannelIntelligenceReport,
  type ChannelVideoMetrics,
  computeChannelCorrelations,
  detectChannelQuestionIntent,
  rankVideosByWatchMinutesPerImpression,
  watchMinutesPerImpression,
} from '@/lib/services/channel-intelligence';
import type { ChannelPackagingRules } from '@/lib/services/packaging-intelligence/channel-rules';

function makeVideo(
  overrides: Partial<ChannelVideoMetrics> & { videoId: string; title: string }
): ChannelVideoMetrics {
  return {
    publishedAt: '2025-01-01T00:00:00.000Z',
    impressions: 10_000,
    ctr: 0.05,
    views: 500,
    watchMinutes: 2_000, // 0.2 WMPI default
    avgViewDurationSeconds: 240,
    reachTrend: 0.05,
    hasFace: null,
    hasText: null,
    topic: null,
    durationSeconds: 300,
    titleWordCount: 6,
    ...overrides,
  };
}

describe('watchMinutesPerImpression', () => {
  it('uses watchMinutes / impressions as the primary metric', () => {
    const v = makeVideo({
      videoId: 'a',
      title: 'A',
      impressions: 1_000,
      watchMinutes: 500,
      ctr: 0.99, // high CTR must not replace ranking metric
      avgViewDurationSeconds: 10,
    });
    expect(watchMinutesPerImpression(v)).toBeCloseTo(0.5, 6);
  });

  it('falls back to CTR × AVD(minutes) when watch minutes are missing', () => {
    const v = makeVideo({
      videoId: 'b',
      title: 'B',
      impressions: 1_000,
      watchMinutes: 0,
      ctr: 0.1,
      avgViewDurationSeconds: 120, // 2 minutes
    });
    // 0.1 * 2 = 0.2
    expect(watchMinutesPerImpression(v)).toBeCloseTo(0.2, 6);
  });

  it('returns 0 when impressions are zero', () => {
    const v = makeVideo({
      videoId: 'c',
      title: 'C',
      impressions: 0,
      watchMinutes: 100,
    });
    expect(watchMinutesPerImpression(v)).toBe(0);
  });
});

describe('rankVideosByWatchMinutesPerImpression', () => {
  it('ranks by WMPI not CTR alone', () => {
    const highCtrLowRetention = makeVideo({
      videoId: 'clickbait',
      title: 'Clickbait',
      impressions: 10_000,
      ctr: 0.2, // excellent CTR
      watchMinutes: 500, // 0.05 WMPI — weak
      avgViewDurationSeconds: 15,
    });
    const lowerCtrHighRetention = makeVideo({
      videoId: 'keeper',
      title: 'Keeper',
      impressions: 10_000,
      ctr: 0.04, // lower CTR
      watchMinutes: 3_000, // 0.3 WMPI — strong
      avgViewDurationSeconds: 450,
    });

    const ranked = rankVideosByWatchMinutesPerImpression([
      highCtrLowRetention,
      lowerCtrHighRetention,
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.videoId).toBe('keeper');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.videoId).toBe('clickbait');
    expect(ranked[0]?.sources[0]?.kind).toBe('youtube_reporting_api');
  });

  it('excludes videos below the impression floor', () => {
    const ranked = rankVideosByWatchMinutesPerImpression([
      makeVideo({
        videoId: 'tiny',
        title: 'Tiny',
        impressions: 50,
        watchMinutes: 100,
      }),
      makeVideo({
        videoId: 'ok',
        title: 'Ok',
        impressions: 500,
        watchMinutes: 100,
      }),
    ]);
    expect(ranked.map(v => v.videoId)).toEqual(['ok']);
  });
});

describe('computeChannelCorrelations', () => {
  it('surfaces face / text / topic / length correlations on this channel', () => {
    const videos: ChannelVideoMetrics[] = [
      makeVideo({
        videoId: 'f1',
        title: 'Face 1',
        hasFace: true,
        hasText: false,
        topic: 'Music',
        durationSeconds: 120,
        watchMinutes: 4_000, // 0.4
      }),
      makeVideo({
        videoId: 'f2',
        title: 'Face 2',
        hasFace: true,
        hasText: false,
        topic: 'Music',
        durationSeconds: 150,
        watchMinutes: 3_500, // 0.35
      }),
      makeVideo({
        videoId: 'f3',
        title: 'Face 3',
        hasFace: true,
        hasText: true,
        topic: 'Music',
        durationSeconds: 160,
        watchMinutes: 3_800, // 0.38
      }),
      makeVideo({
        videoId: 'n1',
        title: 'No face 1',
        hasFace: false,
        hasText: true,
        topic: 'Vlog',
        durationSeconds: 900,
        watchMinutes: 1_000, // 0.1
      }),
      makeVideo({
        videoId: 'n2',
        title: 'No face 2',
        hasFace: false,
        hasText: true,
        topic: 'Vlog',
        durationSeconds: 850,
        watchMinutes: 1_200, // 0.12
      }),
      makeVideo({
        videoId: 'n3',
        title: 'No face 3',
        hasFace: false,
        hasText: false,
        topic: 'Vlog',
        durationSeconds: 800,
        watchMinutes: 800, // 0.08
      }),
    ];

    const { findings } = computeChannelCorrelations(videos);
    const face = findings.find(f => f.segmentKey === 'face:yes');
    const noFace = findings.find(f => f.segmentKey === 'face:no');
    const music = findings.find(f => f.segmentKey === 'topic:music');
    const short = findings.find(f => f.segmentKey === 'length:short');

    expect(face).toBeDefined();
    expect(noFace).toBeDefined();
    expect(face!.liftVsChannel).toBeGreaterThan(0);
    expect(noFace!.liftVsChannel).toBeLessThan(0);
    expect(music).toBeDefined();
    expect(short).toBeDefined();
    expect(findings.every(f => f.sources.length > 0)).toBe(true);
  });
});

describe('buildChannelIntelligenceReport', () => {
  it('builds ranked report, what-works, declining, and sources', () => {
    const videos = [
      makeVideo({
        videoId: 'best',
        title: 'Best',
        watchMinutes: 5_000,
        hasFace: true,
        reachTrend: 0.2,
      }),
      makeVideo({
        videoId: 'mid',
        title: 'Mid',
        watchMinutes: 2_000,
        hasFace: true,
        reachTrend: 0,
      }),
      makeVideo({
        videoId: 'fade',
        title: 'Fading',
        watchMinutes: 1_500,
        hasFace: false,
        reachTrend: -0.25,
      }),
      makeVideo({
        videoId: 'fade2',
        title: 'Fading 2',
        watchMinutes: 1_400,
        hasFace: false,
        reachTrend: -0.15,
      }),
      makeVideo({
        videoId: 'fade3',
        title: 'Fading 3',
        watchMinutes: 1_300,
        hasFace: false,
        reachTrend: 0.01,
      }),
    ];

    const report = buildChannelIntelligenceReport({
      channelId: 'UC_test',
      videos,
      nowIso: '2026-08-01T00:00:00.000Z',
    });

    expect(report.channelId).toBe('UC_test');
    expect(report.generatedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(report.rankedVideos[0]?.videoId).toBe('best');
    expect(report.declining.map(v => v.videoId)).toContain('fade');
    expect(report.sources.some(s => s.kind === 'youtube_reporting_api')).toBe(
      true
    );
  });

  it('merges learning-layer rules into whatWorks when confident', () => {
    const rules: ChannelPackagingRules = {
      channelId: 'UC_test',
      topic: null,
      dimensions: {
        face: {
          liftDirection: 'positive',
          liftPercent: 22,
          confidence: 0.92,
          sampleSize: 500,
          provenance: [
            {
              experimentId: 'exp-1',
              outcome: 'win',
              recordedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const report = buildChannelIntelligenceReport({
      channelId: 'UC_test',
      videos: [
        makeVideo({ videoId: 'a', title: 'A', hasFace: true }),
        makeVideo({ videoId: 'b', title: 'B', hasFace: true }),
        makeVideo({ videoId: 'c', title: 'C', hasFace: true }),
      ],
      channelRules: rules,
    });

    expect(
      report.whatWorks.some(f =>
        f.sources.some(s => s.kind === 'learning_layer')
      )
    ).toBe(true);
    expect(report.sources.some(s => s.kind === 'learning_layer')).toBe(true);
  });
});

describe('detectChannelQuestionIntent + answerChannelQuestion', () => {
  const report = buildChannelIntelligenceReport({
    channelId: 'UC_test',
    videos: [
      makeVideo({
        videoId: 'best',
        title: 'Banger',
        watchMinutes: 5_000,
        hasFace: true,
      }),
      makeVideo({
        videoId: 'ok',
        title: 'Okay',
        watchMinutes: 2_000,
        hasFace: true,
      }),
      makeVideo({
        videoId: 'meh',
        title: 'Meh',
        watchMinutes: 500,
        hasFace: false,
        reachTrend: -0.3,
      }),
    ],
  });

  it.each([
    ['what are my best videos?', 'best_videos'],
    ['show my worst videos', 'worst_videos'],
    ["what's working on my channel?", 'whats_working'],
    ["what's declining?", 'whats_declining'],
    ['channel intelligence report', 'channel_overview'],
  ] as const)('detects intent for %s', (text, intent) => {
    expect(detectChannelQuestionIntent(text)).toBe(intent);
  });

  it('returns null for unrelated questions', () => {
    expect(detectChannelQuestionIntent('update my bio')).toBeNull();
  });

  it('answers best videos from real report data with sources', () => {
    const answer = answerChannelQuestion(report, 'best_videos');
    expect(answer.hasData).toBe(true);
    expect(answer.rankedVideos[0]?.title).toBe('Banger');
    expect(answer.summary).toMatch(/watch minutes per impression/i);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.sources[0]?.kind).toBe('youtube_reporting_api');
  });

  it('answers without inventing data when report is empty', () => {
    const answer = answerChannelQuestion(null, 'best_videos');
    expect(answer.hasData).toBe(false);
    expect(answer.rankedVideos).toEqual([]);
    expect(answer.summary).toMatch(/connect/i);
  });

  it('answerChannelQuestionFromText routes free-form chat', () => {
    const answer = answerChannelQuestionFromText(
      report,
      'what are my best videos right now?'
    );
    expect(answer?.intent).toBe('best_videos');
    expect(answer?.hasData).toBe(true);
  });
});
