/**
 * Unit tests for Spotify import functionality.
 *
 * Tests cover:
 * - Album batch import
 * - Track import with ISRC
 * - Cross-platform link discovery
 * - Error handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies before imports
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: vi.fn((_, callback) => callback({ setAttribute: vi.fn() })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => {
      const queryBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        then: (resolve: (value: unknown[]) => unknown) => resolve([]),
      };

      return queryBuilder;
    }),
  },
}));

const mockGetSpotifyArtistAlbums = vi.fn().mockResolvedValue([]);
const mockGetSpotifyAlbums = vi.fn().mockResolvedValue([]);
const mockGetSpotifyTracks = vi.fn().mockResolvedValue([]);
const mockMapSpotifyAlbumType = vi.fn().mockReturnValue('album');
const mockSafeParse = vi.fn((id: unknown) => ({
  success: typeof id === 'string' && id.length > 0,
}));
const mockGetBestSpotifyImage = vi
  .fn()
  .mockReturnValue('https://example.com/image.jpg');
const mockUpsertRelease = vi.fn().mockResolvedValue({ id: 'release-1' });
const mockUpsertTrack = vi.fn().mockResolvedValue({ id: 'track-1' });

vi.mock('@/lib/spotify', () => ({
  getSpotifyArtistAlbums: mockGetSpotifyArtistAlbums,
  getSpotifyAlbums: mockGetSpotifyAlbums,
  getSpotifyTracks: mockGetSpotifyTracks,
  buildSpotifyAlbumUrl: vi.fn(
    (id: string) => `https://open.spotify.com/album/${id}`
  ),
  buildSpotifyTrackUrl: vi.fn(
    (id: string) => `https://open.spotify.com/track/${id}`
  ),
  getBestSpotifyImage: mockGetBestSpotifyImage,
  mapSpotifyAlbumType: mockMapSpotifyAlbumType,
  parseSpotifyReleaseDate: vi.fn().mockReturnValue(new Date('2024-01-01')),
}));

vi.mock('@/lib/spotify/sanitize', () => ({
  sanitizeImageUrl: vi.fn((url: string) => url),
  sanitizeName: vi.fn((name: string) => name),
  sanitizeText: vi.fn((text: string) => text),
}));

vi.mock('@/lib/validation/schemas/spotify', () => ({
  spotifyArtistIdSchema: {
    safeParse: mockSafeParse,
  },
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: vi.fn().mockResolvedValue([]),
  upsertProviderLink: vi.fn().mockResolvedValue({ id: 'link-1' }),
  upsertRelease: mockUpsertRelease,
  upsertTrack: mockUpsertTrack,
}));

vi.mock('@/lib/discography/slug', () => ({
  generateUniqueSlug: vi.fn().mockResolvedValue('test-slug'),
}));

vi.mock('@/lib/discography/artist-parser', () => ({
  parseArtistCredits: vi.fn().mockReturnValue([]),
  parseMainArtists: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/discography/artist-queries', () => ({
  processReleaseArtistCredits: vi.fn().mockResolvedValue(undefined),
  processTrackArtistCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/discography/discovery', () => ({
  discoverLinksForRelease: vi.fn().mockResolvedValue(undefined),
}));

describe('spotify-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock implementations
    mockGetSpotifyArtistAlbums.mockResolvedValue([]);
    mockGetSpotifyAlbums.mockResolvedValue([]);
    mockGetSpotifyTracks.mockResolvedValue([]);
    mockMapSpotifyAlbumType.mockReturnValue('album');
    mockGetBestSpotifyImage.mockReturnValue('https://example.com/image.jpg');
    mockUpsertRelease.mockResolvedValue({ id: 'release-1' });
    mockUpsertTrack.mockResolvedValue({ id: 'track-1' });
    mockSafeParse.mockImplementation((id: unknown) => ({
      success: typeof id === 'string' && id.length > 0,
    }));
  });

  describe('importReleasesFromSpotify', () => {
    it('should return error for invalid Spotify artist ID', async () => {
      mockSafeParse.mockReturnValueOnce({ success: false });

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify(
        'profile-123',
        'invalid-id'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid Spotify artist ID format');
    });

    it('should return error for invalid creator profile ID', async () => {
      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify(
        '',
        '6Ghvu1VvMGScGpOUJBAHNH'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid creator profile ID');
    });

    it('should return success with empty releases when artist has no albums', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify(
        'profile-123',
        '6Ghvu1VvMGScGpOUJBAHNH'
      );

      expect(result.success).toBe(true);
      expect(result.imported).toBe(0);
    });

    it('should truncate releases when exceeding max limit', async () => {
      const manyAlbums = Array.from({ length: 250 }, (_, i) => ({
        id: `album-${i}`,
        name: `Album ${i}`,
        album_type: 'album',
        total_tracks: 10,
        release_date: '2024-01-01',
        release_date_precision: 'day',
        artists: [{ id: 'artist-1', name: 'Test Artist' }],
        images: [],
      }));
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce(manyAlbums);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify(
        'profile-123',
        '6Ghvu1VvMGScGpOUJBAHNH'
      );

      // Should truncate to 200 (MAX_RELEASES_PER_IMPORT)
      expect(result.imported).toBeLessThanOrEqual(200);
    });
  });

  describe('getSpotifyArtistIdForProfile', () => {
    it('should return null when profile has no Spotify ID', async () => {
      const { getSpotifyArtistIdForProfile } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await getSpotifyArtistIdForProfile('profile-123');

      expect(result).toBeNull();
    });
  });

  describe('syncReleasesFromSpotify', () => {
    it('should return error when no Spotify artist is connected', async () => {
      const { syncReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await syncReleasesFromSpotify('profile-123');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No Spotify artist connected');
    });
  });

  describe('SpotifyImportResult structure', () => {
    it('should have correct structure on success', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify(
        'profile-123',
        '6Ghvu1VvMGScGpOUJBAHNH'
      );

      expect(result).toMatchObject({
        success: expect.any(Boolean),
        imported: expect.any(Number),
        updated: expect.any(Number),
        failed: expect.any(Number),
        releases: expect.any(Array),
        errors: expect.any(Array),
      });
    });

    it('should have correct structure on validation failure', async () => {
      mockSafeParse.mockReturnValueOnce({ success: false });

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      const result = await importReleasesFromSpotify('profile-123', 'bad-id');

      expect(result.success).toBe(false);
      expect(result.imported).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('import options', () => {
    it('should use default options when none provided', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH');

      expect(mockGetSpotifyArtistAlbums).toHaveBeenCalledWith(
        '6Ghvu1VvMGScGpOUJBAHNH',
        expect.objectContaining({
          includeGroups: ['album', 'single', 'compilation'],
          market: 'US',
        })
      );
    });

    it('should respect custom includeGroups option', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH', {
        includeGroups: ['single'],
      });

      expect(mockGetSpotifyArtistAlbums).toHaveBeenCalledWith(
        '6Ghvu1VvMGScGpOUJBAHNH',
        expect.objectContaining({
          includeGroups: ['single'],
        })
      );
    });

    it('should respect custom market option', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH', {
        market: 'GB',
      });

      expect(mockGetSpotifyArtistAlbums).toHaveBeenCalledWith(
        '6Ghvu1VvMGScGpOUJBAHNH',
        expect.objectContaining({
          market: 'GB',
        })
      );
    });
  });

  describe('release metadata precedence', () => {
    it('fetches full track metadata and persists valid ISRC from track endpoint', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([
        {
          id: 'album-isrc',
          name: 'ISRC Release',
          album_type: 'single',
          total_tracks: 1,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
          images: [],
          uri: 'spotify:album:album-isrc',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-isrc',
          },
        },
      ]);

      mockGetSpotifyAlbums.mockResolvedValueOnce([
        {
          id: 'album-isrc',
          name: 'ISRC Release',
          album_type: 'single',
          total_tracks: 1,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [
            {
              id: 'artist-1',
              name: 'Artist Name',
              external_urls: {
                spotify: 'https://open.spotify.com/artist/artist-1',
              },
            },
          ],
          images: [],
          uri: 'spotify:album:album-isrc',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-isrc',
          },
          tracks: {
            items: [
              {
                id: 'track-1',
                name: 'Track 1',
                track_number: 1,
                disc_number: 1,
                duration_ms: 180000,
                explicit: false,
                external_urls: {
                  spotify: 'https://open.spotify.com/track/track-1',
                },
                uri: 'spotify:track:track-1',
                preview_url: null,
                artists: [{ id: 'artist-1', name: 'Artist Name' }],
              },
            ],
            total: 1,
            next: null,
          },
          label: 'Test Label',
          popularity: 30,
          copyrights: [],
          external_ids: { upc: '123456789012' },
        },
      ]);

      mockGetSpotifyTracks.mockResolvedValueOnce([
        {
          id: 'track-1',
          name: 'Track 1',
          track_number: 1,
          disc_number: 1,
          duration_ms: 180000,
          explicit: false,
          external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
          uri: 'spotify:track:track-1',
          preview_url: null,
          external_ids: { isrc: 'us-abc-24-12345' },
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
        },
      ]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH');

      expect(mockGetSpotifyTracks).toHaveBeenCalledWith(['track-1'], 'US');
      expect(mockUpsertTrack).toHaveBeenCalledWith(
        expect.objectContaining({ isrc: 'USABC2412345' })
      );
    });

    it('drops malformed ISRC values from full track metadata', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([
        {
          id: 'album-invalid-isrc',
          name: 'Bad ISRC Release',
          album_type: 'single',
          total_tracks: 1,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
          images: [],
          uri: 'spotify:album:album-invalid-isrc',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-invalid-isrc',
          },
        },
      ]);

      mockGetSpotifyAlbums.mockResolvedValueOnce([
        {
          id: 'album-invalid-isrc',
          name: 'Bad ISRC Release',
          album_type: 'single',
          total_tracks: 1,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [
            {
              id: 'artist-1',
              name: 'Artist Name',
              external_urls: {
                spotify: 'https://open.spotify.com/artist/artist-1',
              },
            },
          ],
          images: [],
          uri: 'spotify:album:album-invalid-isrc',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-invalid-isrc',
          },
          tracks: {
            items: [
              {
                id: 'track-1',
                name: 'Track 1',
                track_number: 1,
                disc_number: 1,
                duration_ms: 180000,
                explicit: false,
                external_urls: {
                  spotify: 'https://open.spotify.com/track/track-1',
                },
                uri: 'spotify:track:track-1',
                preview_url: null,
                artists: [{ id: 'artist-1', name: 'Artist Name' }],
              },
            ],
            total: 1,
            next: null,
          },
          label: 'Test Label',
          popularity: 30,
          copyrights: [],
          external_ids: { upc: '123456789012' },
        },
      ]);

      mockGetSpotifyTracks.mockResolvedValueOnce([
        {
          id: 'track-1',
          name: 'Track 1',
          track_number: 1,
          disc_number: 1,
          duration_ms: 180000,
          explicit: false,
          external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
          uri: 'spotify:track:track-1',
          preview_url: null,
          external_ids: { isrc: 'BAD' },
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
        },
      ]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH');

      expect(mockUpsertTrack).toHaveBeenCalledWith(
        expect.objectContaining({ isrc: null })
      );
    });

    it('classifies EPs based on full album track count when summary album says single', async () => {
      mockMapSpotifyAlbumType.mockReturnValue('single');

      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([
        {
          id: 'album-ep',
          name: 'Great EP',
          album_type: 'single',
          total_tracks: 1,
          release_date: '2024-05-10',
          release_date_precision: 'day',
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
          images: [
            {
              url: 'https://summary.example/image.jpg',
              height: 300,
              width: 300,
            },
          ],
          uri: 'spotify:album:album-ep',
          external_urls: { spotify: 'https://open.spotify.com/album/album-ep' },
        },
      ]);

      mockGetSpotifyAlbums.mockResolvedValueOnce([
        {
          id: 'album-ep',
          name: 'Great EP',
          album_type: 'single',
          total_tracks: 5,
          release_date: '2024-05-10',
          release_date_precision: 'day',
          artists: [
            {
              id: 'artist-1',
              name: 'Artist Name',
              external_urls: {
                spotify: 'https://open.spotify.com/artist/artist-1',
              },
            },
          ],
          images: [
            { url: 'https://full.example/image.jpg', height: 640, width: 640 },
          ],
          uri: 'spotify:album:album-ep',
          external_urls: { spotify: 'https://open.spotify.com/album/album-ep' },
          tracks: { items: [], total: 5, next: null },
          label: 'Test Label',
          popularity: 40,
          copyrights: [],
          external_ids: { upc: '123456789012' },
        },
      ]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH');

      expect(mockUpsertRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseType: 'ep',
          totalTracks: 5,
        })
      );
    });

    it('prefers full album artwork when available', async () => {
      mockGetSpotifyArtistAlbums.mockResolvedValueOnce([
        {
          id: 'album-artwork',
          name: 'Artwork Release',
          album_type: 'album',
          total_tracks: 10,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [{ id: 'artist-1', name: 'Artist Name' }],
          images: [
            {
              url: 'https://summary.example/image.jpg',
              height: 300,
              width: 300,
            },
          ],
          uri: 'spotify:album:album-artwork',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-artwork',
          },
        },
      ]);

      const fullImage = {
        url: 'https://full.example/image.jpg',
        height: 640,
        width: 640,
      };
      mockGetSpotifyAlbums.mockResolvedValueOnce([
        {
          id: 'album-artwork',
          name: 'Artwork Release',
          album_type: 'album',
          total_tracks: 10,
          release_date: '2024-01-01',
          release_date_precision: 'day',
          artists: [
            {
              id: 'artist-1',
              name: 'Artist Name',
              external_urls: {
                spotify: 'https://open.spotify.com/artist/artist-1',
              },
            },
          ],
          images: [fullImage],
          uri: 'spotify:album:album-artwork',
          external_urls: {
            spotify: 'https://open.spotify.com/album/album-artwork',
          },
          tracks: { items: [], total: 10, next: null },
          label: 'Test Label',
          popularity: 55,
          copyrights: [],
          external_ids: { upc: '123456789012' },
        },
      ]);

      const { importReleasesFromSpotify } = await import(
        '@/lib/discography/spotify-import'
      );

      await importReleasesFromSpotify('profile-123', '6Ghvu1VvMGScGpOUJBAHNH');

      expect(mockGetBestSpotifyImage).toHaveBeenCalledWith([fullImage]);
    });
  });
});
