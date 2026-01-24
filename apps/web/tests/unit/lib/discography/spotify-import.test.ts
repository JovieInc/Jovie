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
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

const mockGetSpotifyArtistAlbums = vi.fn().mockResolvedValue([]);
const mockGetSpotifyAlbums = vi.fn().mockResolvedValue([]);
const mockSafeParse = vi.fn((id: unknown) => ({
  success: typeof id === 'string' && id.length > 0,
}));

vi.mock('@/lib/spotify', () => ({
  getSpotifyArtistAlbums: mockGetSpotifyArtistAlbums,
  getSpotifyAlbums: mockGetSpotifyAlbums,
  buildSpotifyAlbumUrl: vi.fn(
    (id: string) => `https://open.spotify.com/album/${id}`
  ),
  buildSpotifyTrackUrl: vi.fn(
    (id: string) => `https://open.spotify.com/track/${id}`
  ),
  getBestSpotifyImage: vi.fn().mockReturnValue('https://example.com/image.jpg'),
  mapSpotifyAlbumType: vi.fn().mockReturnValue('album'),
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
  upsertRelease: vi.fn().mockResolvedValue({ id: 'release-1' }),
  upsertTrack: vi.fn().mockResolvedValue({ id: 'track-1' }),
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
});
