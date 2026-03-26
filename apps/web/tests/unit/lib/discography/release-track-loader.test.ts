import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackWithProviders } from '@/lib/discography/queries';

const mockGetReleaseById = vi.fn();
const mockGetTracksForReleaseWithProviders = vi.fn();
const mockGetReleaseTracksForReleaseWithProviders = vi.fn();

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
  getTracksForReleaseWithProviders: mockGetTracksForReleaseWithProviders,
  getReleaseTracksForReleaseWithProviders:
    mockGetReleaseTracksForReleaseWithProviders,
}));

describe('release-track-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: new model returns empty, so loader falls back to legacy
    mockGetReleaseTracksForReleaseWithProviders.mockResolvedValue({
      tracks: [],
      total: 0,
      hasMore: false,
    });
  });

  it('loads owned release tracks and maps canonical provider metadata', async () => {
    mockGetReleaseById.mockResolvedValue({
      id: 'release-1',
      creatorProfileId: 'profile-1',
      slug: 'my-release',
    });

    const tracks: TrackWithProviders[] = [
      {
        id: 'track-1',
        releaseId: 'release-1',
        creatorProfileId: 'profile-1',
        title: 'First Track',
        slug: 'first-track',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 180_000,
        isExplicit: false,
        isrc: 'USRC17607839',
        previewUrl: 'https://example.com/preview.mp3',
        audioUrl: null,
        audioFormat: null,
        providerLinks: [
          {
            id: 'pl-1',
            ownerType: 'track',
            releaseId: null,
            trackId: 'track-1',
            releaseTrackId: null,
            providerId: 'spotify',
            externalId: null,
            url: 'https://open.spotify.com/track/abc',
            country: null,
            isPrimary: true,
            sourceType: 'manual',
            metadata: {},
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-02T00:00:00.000Z'),
          },
        ],
      },
    ];

    mockGetTracksForReleaseWithProviders.mockResolvedValue({
      tracks,
      total: 1,
      hasMore: false,
    });

    const { loadReleaseTracksForProfile } = await import(
      '@/lib/discography/release-track-loader'
    );

    const result = await loadReleaseTracksForProfile({
      releaseId: 'release-1',
      profileId: 'profile-1',
      profileHandle: 'artist',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.smartLinkPath).toBe('/artist/my-release/first-track');
    expect(result[0]?.releaseSlug).toBe('my-release');
    expect(result[0]?.providers).toEqual([
      expect.objectContaining({
        key: 'spotify',
        label: 'Spotify',
        source: 'manual',
        path: '/artist/my-release/first-track?dsp=spotify',
        isPrimary: true,
      }),
    ]);
  });

  it('throws when the release is not owned by the profile', async () => {
    mockGetReleaseById.mockResolvedValue({
      id: 'release-1',
      creatorProfileId: 'other-profile',
    });

    const { loadReleaseTracksForProfile } = await import(
      '@/lib/discography/release-track-loader'
    );

    await expect(
      loadReleaseTracksForProfile({
        releaseId: 'release-1',
        profileId: 'profile-1',
        profileHandle: 'artist',
      })
    ).rejects.toThrowError(new TypeError('Release not found'));

    expect(mockGetTracksForReleaseWithProviders).not.toHaveBeenCalled();
  });
});
