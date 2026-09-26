import { describe, expect, it } from 'vitest';
import {
  computeChannelCorrelations,
  mergeLearningLayerAnnotations,
} from './correlations';
import type { ChannelVideoMetrics } from './types';

function video(
  videoId: string,
  wmpi: number,
  hasFace: boolean
): ChannelVideoMetrics {
  const impressions = 2_000;
  return {
    videoId,
    title: videoId,
    publishedAt: '2024-06-01T00:00:00Z',
    impressions,
    views: 100,
    watchMinutes: wmpi * impressions,
    ctr: 0.05,
    avgViewDurationSeconds: 240,
    reachTrend: 0,
    hasFace,
    hasText: false,
    topic: 'music',
    titleWordCount: 2,
    durationSeconds: 600,
  };
}

function facePair(faceWmpi: number, plainWmpi: number): ChannelVideoMetrics[] {
  return [0, 1, 2].flatMap(index => [
    video(`face_${faceWmpi}_${index}`, faceWmpi, true),
    video(`plain_${plainWmpi}_${index}`, plainWmpi, false),
  ]);
}

describe('computeChannelCorrelations lift', () => {
  it('compares the best group with a positive weaker group', () => {
    const face = computeChannelCorrelations(facePair(0.4, 0.3)).find(
      signal => signal.dimension === 'face'
    );

    expect(face?.liftPercent).toBeCloseTo(33.3333, 3);
  });

  it('treats a zero weaker group as a full relative lift', () => {
    const face = computeChannelCorrelations(facePair(0.4, 0)).find(
      signal => signal.dimension === 'face'
    );

    expect(face?.liftPercent).toBe(100);
  });
});

describe('mergeLearningLayerAnnotations confidence', () => {
  it.each([
    [0.96, 'high'],
    [0.9, 'medium'],
    [0.8, 'low'],
  ] as const)('maps confidence %s to %s', (confidence, label) => {
    const [signal] = mergeLearningLayerAnnotations(
      [],
      [
        {
          dimension: 'face',
          summary: 'Face experiments',
          liftPercent: 12,
          sampleSize: 50,
          confidence,
          source: 'observed',
        },
      ]
    );

    expect(signal?.confidence).toBe(label);
    expect(signal?.summary).toBe('Face experiments');
  });
});
