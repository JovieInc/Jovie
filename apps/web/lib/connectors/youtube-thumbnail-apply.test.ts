import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { applyYouTubeThumbnail } from './youtube-thumbnail-apply';
import { buildYouTubeThumbnailCandidatePayload } from './youtube-thumbnail-candidate';

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const hash = createHash('sha256').update(bytes).digest('hex');
const payload = buildYouTubeThumbnailCandidatePayload({
  creatorProfileId: '00000000-0000-4000-8000-000000000001',
  channelId: 'UC-owned',
  youtubeVideoId: 'video-1',
  videoTitle: 'A song',
  candidateThumbnailVersionId: '00000000-0000-4000-8000-000000000002',
  candidateImageUrl: 'https://cdn.example.com/candidate.png',
  currentThumbnailUrl: 'https://i.ytimg.com/current.jpg',
  artifactSha256: hash,
  apiMetrics: {
    source: 'youtube-analytics-api',
    window: 'lifetime',
    capturedAt: '2026-09-01T12:00:00.000Z',
    views: 1,
    watchTimeMinutes: 1,
    avgViewDurationSeconds: 1,
    impressions: null,
    ctr: null,
  },
});
const base = {
  approved: true,
  approvalExpiresAt: new Date('2026-09-02T00:00:00.000Z'),
  payload,
  runtimeIdentity: {
    channelId: 'UC-owned',
    channelTitle: 'Founder channel',
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
  },
  videoId: 'video-1',
  videoTitle: 'A song',
  artifactSha256: hash,
  mediaType: 'image/png',
  bytes,
  provider: {
    setThumbnail: vi.fn(async () => ({
      operationId: 'op-1',
      beforeSha256: 'b'.repeat(64),
      afterSha256: hash,
    })),
  },
  hasApplied: false,
  now: new Date('2026-09-01T12:00:00.000Z'),
};

describe('applyYouTubeThumbnail', () => {
  it('applies only the exact approved mapping and returns an audit receipt', async () => {
    const result = await applyYouTubeThumbnail(base);
    expect(result).toMatchObject({
      ok: true,
      operationId: 'op-1',
      audit: {
        channelId: 'UC-owned',
        channelTitle: 'Founder channel',
        videoId: 'video-1',
      },
    });
  });

  it.each([
    [
      'expired approval',
      { approvalExpiresAt: new Date('2026-08-31') },
      'stale-approval',
    ],
    [
      'wrong channel',
      { runtimeIdentity: { ...base.runtimeIdentity, channelId: 'UC-other' } },
      'identity-mismatch',
    ],
    [
      'missing write scope',
      { runtimeIdentity: { ...base.runtimeIdentity, scopes: [] } },
      'scope-mismatch',
    ],
    ['wrong video', { videoId: 'video-2' }, 'mapping-mismatch'],
    ['wrong hash', { artifactSha256: 'a'.repeat(64) }, 'artifact-mismatch'],
    ['replay', { hasApplied: true }, 'replay'],
  ])('fails closed for %s', async (_label, overrides, error) => {
    const result = await applyYouTubeThumbnail({ ...base, ...overrides });
    expect(result).toEqual({ ok: false, error });
  });

  it('rejects media mismatches and ambiguous provider success', async () => {
    expect(
      await applyYouTubeThumbnail({ ...base, mediaType: 'image/jpeg' })
    ).toEqual({ ok: false, error: 'unsupported-media-type' });
    expect(
      await applyYouTubeThumbnail({
        ...base,
        provider: {
          setThumbnail: vi.fn(async () => ({
            operationId: 'op',
            beforeSha256: 'b'.repeat(64),
            afterSha256: 'c'.repeat(64),
          })),
        },
      })
    ).toEqual({ ok: false, error: 'ambiguous-provider-result' });
  });
});
