import { describe, expect, it } from 'vitest';
import {
  buildYouTubeThumbnailCandidatePayload,
  buildYouTubeThumbnailDecisionReceipt,
  parseYouTubeThumbnailCandidate,
} from './youtube-thumbnail-candidate';

const payload = buildYouTubeThumbnailCandidatePayload({
  creatorProfileId: '00000000-0000-4000-8000-000000000001',
  channelId: 'UC-owned',
  youtubeVideoId: 'video-1',
  videoTitle: 'A song',
  candidateThumbnailVersionId: '00000000-0000-4000-8000-000000000002',
  candidateImageUrl: 'https://cdn.example.com/candidate.jpg',
  currentThumbnailUrl: 'https://i.ytimg.com/current.jpg',
  artifactSha256:
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  apiMetrics: {
    source: 'youtube-analytics-api',
    window: 'lifetime',
    capturedAt: '2026-09-01T12:00:00.000Z',
    views: 1250,
    watchTimeMinutes: 300,
    avgViewDurationSeconds: 42,
    impressions: null,
    ctr: null,
  },
});

describe('YouTube thumbnail candidate contract', () => {
  it('pins exact artifact, channel, video, API evidence, and publication gate', () => {
    expect(
      parseYouTubeThumbnailCandidate('youtube.thumbnail_candidate', payload)
    ).toEqual(payload);
    expect(payload.publicationGate).toEqual({
      state: 'blocked',
      reason: 'direct-thumbnail-mutation-disabled-native-experiment-required',
      requiredProof: [
        'founder-candidate-approval',
        'youtube-studio-native-experiment',
        'provider-readback-receipt',
      ],
    });
    expect(payload.apiMetrics).toMatchObject({
      source: 'youtube-analytics-api',
      impressions: null,
      ctr: null,
    });
  });

  it('rejects missing hashes and invented CTR evidence', () => {
    expect(
      parseYouTubeThumbnailCandidate('youtube.thumbnail_candidate', {
        ...payload,
        artifactSha256: null,
      })
    ).toBeNull();
    expect(
      parseYouTubeThumbnailCandidate('youtube.thumbnail_candidate', {
        ...payload,
        apiMetrics: { ...payload.apiMetrics, ctr: 0.08 },
      })
    ).toBeNull();
  });

  it('approval creates a traceable receipt without authorizing publication', () => {
    expect(
      buildYouTubeThumbnailDecisionReceipt({
        payload,
        decision: 'approved',
        decidedAt: new Date('2026-09-01T12:05:00.000Z'),
      })
    ).toMatchObject({
      state: 'approved-publication-blocked',
      decision: 'approved',
      channelId: 'UC-owned',
      youtubeVideoId: 'video-1',
      artifactSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      youtubeMutationPerformed: false,
      publicationGate: {
        state: 'blocked',
        reason: 'direct-thumbnail-mutation-disabled-native-experiment-required',
      },
    });
  });
});
