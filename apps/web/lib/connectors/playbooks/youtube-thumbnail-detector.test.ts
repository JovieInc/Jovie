import { describe, expect, it } from 'vitest';
import {
  buildThumbnailOpportunityPayload,
  buildThumbnailReportCardPayload,
  PROJECTED_IMPACT_RANGE,
  selectWeakThumbnailVideos,
} from './youtube-thumbnail-detector';

describe('youtube thumbnail detector (JOV-3935)', () => {
  const videos = [
    {
      videoId: 'a',
      title: 'Strong custom',
      isDefaultThumbnail: false,
      qualityScore: 0.9,
    },
    {
      videoId: 'b',
      title: 'Auto frame',
      isDefaultThumbnail: true,
      qualityScore: null,
    },
    {
      videoId: 'c',
      title: 'Low quality custom',
      isDefaultThumbnail: false,
      qualityScore: 0.2,
    },
  ];

  it('selects default and weak-quality thumbnails only', () => {
    const weak = selectWeakThumbnailVideos(videos);
    expect(weak.map(v => v.videoId)).toEqual(['b', 'c']);
  });

  it('builds an opportunity payload with evidence and impact range', () => {
    const payload = buildThumbnailOpportunityPayload({
      userId: 'user-1',
      channelId: 'channel-1',
      videos,
    });

    expect(payload).not.toBeNull();
    expect(payload?.affectedCount).toBe(2);
    expect(payload?.why).toContain('2 videos');
    expect(payload?.projectedImpact.minPercent).toBe(
      PROJECTED_IMPACT_RANGE.minPercent
    );
    expect(payload?.projectedImpact.maxPercent).toBe(
      PROJECTED_IMPACT_RANGE.maxPercent
    );
    expect(payload?.primaryActionLabel).toBe('Generate variants');
  });

  it('returns null when nothing is weak', () => {
    const payload = buildThumbnailOpportunityPayload({
      userId: 'user-1',
      channelId: 'channel-1',
      videos: [
        {
          videoId: 'x',
          title: 'Good',
          isDefaultThumbnail: false,
          qualityScore: 0.95,
        },
      ],
    });
    expect(payload).toBeNull();
  });

  it('builds a measurement report only from provided real deltas', () => {
    const report = buildThumbnailReportCardPayload({
      experimentId: 'exp-1',
      deltaPercent: 12.4,
      items: [
        { videoId: 'b', label: 'Auto frame', deltaPercent: 15 },
        { videoId: 'c', label: 'Low quality custom', deltaPercent: 9.8 },
      ],
    });

    expect(report.deltaPercent).toBe(12.4);
    expect(report.why).toContain('+12.4%');
    expect(report.items).toHaveLength(2);
  });
});
