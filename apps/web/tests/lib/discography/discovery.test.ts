/**
 * Tests for the cross-platform link discovery service.
 *
 * Covers:
 * - Happy-path ISRC lookups (Apple Music, Deezer, MusicFetch)
 * - Search URL fallbacks when canonical links cannot be resolved
 * - Error handling and partial failures
 * - MusicFetch unavailability
 * - Existing-provider skip logic
 * - Multiple release batch processing
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module import that depends on them
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// Apple Music provider (MusicKit)
const mockIsAppleMusicAvailable = vi.fn(() => true);
const mockMusicKitLookupByIsrc = vi.fn();
const mockGetAlbum = vi.fn();

vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  isAppleMusicAvailable: () => mockIsAppleMusicAvailable(),
  lookupByIsrc: (...args: unknown[]) => mockMusicKitLookupByIsrc(...args),
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
}));

// MusicFetch
const mockIsMusicfetchAvailable = vi.fn(() => true);
const mockMusicfetchLookupByIsrc = vi.fn();

vi.mock('@/lib/discography/musicfetch', () => ({
  isMusicfetchAvailable: () => mockIsMusicfetchAvailable(),
  lookupByIsrc: (...args: unknown[]) => mockMusicfetchLookupByIsrc(...args),
}));

// Provider links (iTunes fallback, Deezer, buildSearchUrl)
const mockLookupAppleMusicByIsrc = vi.fn();
const mockLookupDeezerByIsrc = vi.fn();
const mockBuildSearchUrl = vi.fn(
  (provider: string, _track: unknown, _opts?: unknown) =>
    `https://search.example.com/${provider}`
);

vi.mock('@/lib/discography/provider-links', () => ({
  lookupAppleMusicByIsrc: (...args: unknown[]) =>
    mockLookupAppleMusicByIsrc(...args),
  lookupDeezerByIsrc: (...args: unknown[]) => mockLookupDeezerByIsrc(...args),
  buildSearchUrl: (provider: string, track: unknown, opts?: unknown) =>
    mockBuildSearchUrl(provider, track, opts),
}));

// Queries
const mockGetTracksForRelease = vi.fn();
const mockUpsertProviderLink = vi.fn().mockResolvedValue({ id: 'link-1' });
const mockGetReleaseById = vi.fn();

vi.mock('@/lib/discography/queries', () => ({
  getTracksForRelease: (...args: unknown[]) => mockGetTracksForRelease(...args),
  upsertProviderLink: (...args: unknown[]) => mockUpsertProviderLink(...args),
  getReleaseById: (...args: unknown[]) => mockGetReleaseById(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'track-1',
    releaseId: 'release-1',
    creatorProfileId: 'profile-1',
    title: 'Anti-Hero',
    slug: 'anti-hero',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 200_000,
    isExplicit: false,
    isrc: 'USUM72212345',
    previewUrl: null,
    sourceType: 'ingested' as const,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'release-1',
    creatorProfileId: 'profile-1',
    title: 'Midnights',
    slug: 'midnights',
    releaseType: 'album',
    releaseDate: new Date('2024-01-01'),
    label: 'Republic',
    upc: '00602445790128',
    totalTracks: 13,
    isExplicit: false,
    artworkUrl: 'https://example.com/art.jpg',
    spotifyPopularity: 95,
    sourceType: 'ingested' as const,
    metadata: {
      spotifyId: 'spotify-album-1',
      spotifyArtists: [{ id: 'artist-1', name: 'Taylor Swift' }],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    providerLinks: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Defaults: everything available but returns null
    mockIsAppleMusicAvailable.mockReturnValue(true);
    mockMusicKitLookupByIsrc.mockResolvedValue(null);
    mockGetAlbum.mockResolvedValue(null);
    mockIsMusicfetchAvailable.mockReturnValue(true);
    mockMusicfetchLookupByIsrc.mockResolvedValue(null);
    mockLookupAppleMusicByIsrc.mockResolvedValue(null);
    mockLookupDeezerByIsrc.mockResolvedValue(null);
    mockGetTracksForRelease.mockResolvedValue([makeTrack()]);
    mockUpsertProviderLink.mockResolvedValue({ id: 'link-1' });
    mockGetReleaseById.mockResolvedValue(makeRelease());
    mockBuildSearchUrl.mockImplementation(
      (provider: string) => `https://search.example.com/${provider}`
    );
  });

  describe('discoverLinksForRelease', () => {
    it('discovers Apple Music, Deezer, and MusicFetch links in parallel', async () => {
      // Apple Music via MusicKit
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-123',
        attributes: {
          url: 'https://music.apple.com/us/album/midnights/123?i=456',
        },
      });

      // Deezer
      mockLookupDeezerByIsrc.mockResolvedValue({
        url: 'https://www.deezer.com/track/789',
        trackId: '789',
        albumUrl: 'https://www.deezer.com/album/100',
        albumId: '100',
      });

      // MusicFetch
      mockMusicfetchLookupByIsrc.mockResolvedValue({
        links: {
          youtube: 'https://music.youtube.com/watch?v=abc',
          tidal: 'https://tidal.com/track/def',
          amazon_music: 'https://music.amazon.com/albums/ghi',
          soundcloud: 'https://soundcloud.com/ts/anti-hero',
        },
        raw: {},
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1', []);

      expect(result.errors).toHaveLength(0);
      // Apple Music + Deezer + 4 MusicFetch + search fallbacks for remaining
      expect(result.discovered.length).toBeGreaterThanOrEqual(6);

      // Canonical lookups
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'apple_music',
          quality: 'canonical',
        })
      );
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'deezer',
          quality: 'canonical',
        })
      );
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'youtube',
          url: 'https://music.youtube.com/watch?v=abc',
          quality: 'canonical',
        })
      );
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'tidal',
          quality: 'canonical',
        })
      );
    });

    it('returns error when no tracks found for release', async () => {
      mockGetTracksForRelease.mockResolvedValue([]);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(result.errors).toContain('No tracks found for release');
      expect(result.discovered).toHaveLength(0);
    });

    it('returns error when no ISRC found on any track', async () => {
      mockGetTracksForRelease.mockResolvedValue([
        makeTrack({ isrc: null }),
        makeTrack({ id: 'track-2', isrc: null, trackNumber: 2 }),
      ]);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(result.errors).toContain('No ISRC found on any track');
      expect(result.discovered).toHaveLength(0);
    });

    it('generates search URL fallbacks when MusicFetch is unavailable', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);
      mockIsAppleMusicAvailable.mockReturnValue(false);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1', []);

      // All 14 fallback providers should get search URLs
      const fallbackLinks = result.discovered.filter(
        d => d.quality === 'search_fallback'
      );
      expect(fallbackLinks.length).toBe(14);

      // Verify specific providers got fallbacks
      const fallbackProviders = fallbackLinks.map(d => d.provider);
      expect(fallbackProviders).toContain('apple_music');
      expect(fallbackProviders).toContain('youtube');
      expect(fallbackProviders).toContain('tidal');
      expect(fallbackProviders).toContain('amazon_music');
      expect(fallbackProviders).toContain('soundcloud');
      expect(fallbackProviders).toContain('deezer');
      expect(fallbackProviders).toContain('pandora');
      expect(fallbackProviders).toContain('napster');
      expect(fallbackProviders).toContain('audiomack');
      expect(fallbackProviders).toContain('qobuz');
      expect(fallbackProviders).toContain('anghami');
      expect(fallbackProviders).toContain('boomplay');
      expect(fallbackProviders).toContain('iheartradio');
      expect(fallbackProviders).toContain('tiktok');

      // buildSearchUrl should have been called for each undiscovered provider
      expect(mockBuildSearchUrl).toHaveBeenCalledTimes(14);

      // Verify the track info was passed to buildSearchUrl
      expect(mockBuildSearchUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'Anti-Hero',
          artistName: 'Taylor Swift',
          isrc: 'USUM72212345',
        }),
        expect.objectContaining({ storefront: 'us' })
      );
    });

    it('generates search fallbacks only for providers not already discovered', async () => {
      // Apple Music found via MusicKit
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-123',
        attributes: {
          url: 'https://music.apple.com/us/album/midnights/123?i=456',
        },
      });

      // Deezer found
      mockLookupDeezerByIsrc.mockResolvedValue({
        url: 'https://www.deezer.com/track/789',
        trackId: '789',
        albumUrl: 'https://www.deezer.com/album/100',
        albumId: '100',
      });

      // MusicFetch unavailable
      mockIsMusicfetchAvailable.mockReturnValue(false);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1', []);

      // apple_music and deezer are canonical, rest are search fallbacks
      const canonical = result.discovered.filter(
        d => d.quality === 'canonical'
      );
      const fallbacks = result.discovered.filter(
        d => d.quality === 'search_fallback'
      );

      expect(canonical).toHaveLength(2);
      expect(canonical.map(d => d.provider).sort()).toEqual([
        'apple_music',
        'deezer',
      ]);

      // 14 total fallback providers minus apple_music and deezer = 12
      expect(fallbacks).toHaveLength(12);
      expect(fallbacks.map(d => d.provider)).not.toContain('apple_music');
      expect(fallbacks.map(d => d.provider)).not.toContain('deezer');
    });

    it('skips existing providers when skipExisting is true', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease(
        'release-1',
        ['apple_music', 'deezer', 'youtube'],
        { skipExisting: true }
      );

      // Should not include apple_music, deezer, or youtube
      const providers = result.discovered.map(d => d.provider);
      expect(providers).not.toContain('apple_music');
      expect(providers).not.toContain('deezer');
      expect(providers).not.toContain('youtube');

      // Should include the other fallback providers
      expect(providers).toContain('tidal');
      expect(providers).toContain('amazon_music');
      expect(providers).toContain('soundcloud');
    });

    it('handles Apple Music MusicKit success without falling back to iTunes', async () => {
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-track-1',
        attributes: {
          url: 'https://music.apple.com/us/album/anti-hero/123?i=456',
        },
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      await discoverLinksForRelease('release-1');

      // MusicKit succeeded, so iTunes should NOT be called
      expect(mockLookupAppleMusicByIsrc).not.toHaveBeenCalled();
    });

    it('falls back to iTunes when MusicKit fails', async () => {
      mockMusicKitLookupByIsrc.mockRejectedValue(
        new Error('MusicKit unavailable')
      );
      mockLookupAppleMusicByIsrc.mockResolvedValue({
        url: 'https://music.apple.com/us/album/anti-hero/123?i=456',
        trackId: '456',
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(mockLookupAppleMusicByIsrc).toHaveBeenCalled();
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'apple_music',
          quality: 'canonical',
        })
      );
    });

    it('falls back to iTunes when MusicKit returns no URL', async () => {
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-track-1',
        attributes: { url: null },
      });
      mockLookupAppleMusicByIsrc.mockResolvedValue({
        url: 'https://music.apple.com/us/album/anti-hero/123?i=456',
        trackId: '456',
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(mockLookupAppleMusicByIsrc).toHaveBeenCalled();
      expect(result.discovered).toContainEqual(
        expect.objectContaining({
          provider: 'apple_music',
          quality: 'canonical',
        })
      );
    });

    it('records errors when individual lookups fail', async () => {
      mockMusicKitLookupByIsrc.mockRejectedValue(new Error('AM timeout'));
      mockLookupAppleMusicByIsrc.mockRejectedValue(new Error('iTunes down'));
      mockLookupDeezerByIsrc.mockRejectedValue(new Error('Deezer 500'));
      mockMusicfetchLookupByIsrc.mockRejectedValue(
        new Error('MF rate limited')
      );

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some(e => e.includes('Deezer'))).toBe(true);
      expect(result.errors.some(e => e.includes('Musicfetch'))).toBe(true);

      // Despite errors, search fallbacks should still be generated
      const fallbacks = result.discovered.filter(
        d => d.quality === 'search_fallback'
      );
      expect(fallbacks.length).toBeGreaterThan(0);
    });

    it('MusicFetch results skip providers already in existingSet', async () => {
      mockMusicfetchLookupByIsrc.mockResolvedValue({
        links: {
          apple_music: 'https://music.apple.com/us/album/existing/1',
          youtube: 'https://music.youtube.com/watch?v=new',
        },
        raw: {},
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1', [
        'apple_music',
      ]);

      // apple_music should be skipped (in existingSet), youtube should be saved
      const canonicalProviders = result.discovered
        .filter(d => d.quality === 'canonical')
        .map(d => d.provider);
      expect(canonicalProviders).toContain('youtube');
      expect(canonicalProviders).not.toContain('apple_music');
    });

    it('uses artist name from release metadata for search fallbacks', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);
      mockGetReleaseById.mockResolvedValue(
        makeRelease({
          metadata: {
            spotifyArtists: [
              { id: 'a1', name: 'Custom Artist' },
              { id: 'a2', name: 'Feat Artist' },
            ],
          },
        })
      );

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      await discoverLinksForRelease('release-1');

      // buildSearchUrl should use the first artist from metadata
      expect(mockBuildSearchUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ artistName: 'Custom Artist' }),
        expect.any(Object)
      );
    });

    it('handles release with no metadata gracefully', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);
      mockGetReleaseById.mockResolvedValue(makeRelease({ metadata: {} }));

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      // Should still generate fallbacks with empty artist name
      expect(mockBuildSearchUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ artistName: '' }),
        expect.any(Object)
      );
      expect(result.discovered.length).toBeGreaterThan(0);
    });

    it('handles getReleaseById returning null', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);
      mockGetReleaseById.mockResolvedValue(null);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      // Should still generate fallbacks with empty artist name
      expect(mockBuildSearchUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ artistName: '' }),
        expect.any(Object)
      );
      expect(result.discovered.length).toBeGreaterThan(0);
    });

    it('respects custom storefront for search fallbacks', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      await discoverLinksForRelease('release-1', [], { storefront: 'gb' });

      // buildSearchUrl should receive the GB storefront
      expect(mockBuildSearchUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ storefront: 'gb' })
      );
    });

    it('upserts provider links for each search fallback', async () => {
      mockIsMusicfetchAvailable.mockReturnValue(false);
      mockIsAppleMusicAvailable.mockReturnValue(false);
      mockLookupAppleMusicByIsrc.mockResolvedValue(null);
      mockLookupDeezerByIsrc.mockResolvedValue(null);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      await discoverLinksForRelease('release-1', []);

      // Should call upsertProviderLink for each fallback
      const fallbackCalls = mockUpsertProviderLink.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).metadata &&
          (call[0] as Record<string, Record<string, unknown>>).metadata
            .discoveredFrom === 'search_fallback'
      );
      expect(fallbackCalls.length).toBe(14);
    });

    it('derives album URL from Apple Music song URL with /album/ path', async () => {
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-track-1',
        attributes: {
          url: 'https://music.apple.com/us/album/midnights/123?i=456',
        },
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      const amLink = result.discovered.find(d => d.provider === 'apple_music');
      expect(amLink?.url).toBe(
        'https://music.apple.com/us/album/midnights/123'
      );
    });

    it('resolves album via relationship when song URL has no /album/ path', async () => {
      mockMusicKitLookupByIsrc.mockResolvedValue({
        id: 'am-track-1',
        attributes: {
          url: 'https://music.apple.com/us/song/anti-hero/456',
        },
        relationships: {
          albums: {
            data: [{ id: 'album-999' }],
          },
        },
      });

      mockGetAlbum.mockResolvedValue({
        attributes: {
          url: 'https://music.apple.com/us/album/midnights/999',
        },
      });

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      const result = await discoverLinksForRelease('release-1');

      expect(mockGetAlbum).toHaveBeenCalledWith('album-999', {
        storefront: 'us',
      });
      const amLink = result.discovered.find(d => d.provider === 'apple_music');
      expect(amLink?.url).toBe(
        'https://music.apple.com/us/album/midnights/999'
      );
    });

    it('uses first track with ISRC, not necessarily first track', async () => {
      mockGetTracksForRelease.mockResolvedValue([
        makeTrack({ trackNumber: 1, isrc: null }),
        makeTrack({ id: 'track-2', trackNumber: 2, isrc: 'GBAYE0200185' }),
        makeTrack({ id: 'track-3', trackNumber: 3, isrc: 'GBAYE0200186' }),
      ]);

      const { discoverLinksForRelease } = await import(
        '@/lib/discography/discovery'
      );

      await discoverLinksForRelease('release-1');

      // MusicFetch should be called with the ISRC from track 2
      expect(mockMusicfetchLookupByIsrc).toHaveBeenCalledWith('GBAYE0200185');
    });
  });

  describe('discoverLinksForReleases', () => {
    it('processes multiple releases sequentially', async () => {
      const callOrder: string[] = [];
      mockGetTracksForRelease.mockImplementation(async (releaseId: string) => {
        callOrder.push(releaseId);
        return [makeTrack({ releaseId })];
      });

      const { discoverLinksForReleases } = await import(
        '@/lib/discography/discovery'
      );

      const results = await discoverLinksForReleases([
        { releaseId: 'release-a', existingProviders: [] },
        { releaseId: 'release-b', existingProviders: [] },
        { releaseId: 'release-c', existingProviders: [] },
      ]);

      expect(results).toHaveLength(3);
      expect(callOrder).toEqual(['release-a', 'release-b', 'release-c']);
    });

    it('continues processing after individual release errors', async () => {
      let callCount = 0;
      mockGetTracksForRelease.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) return []; // Second release has no tracks
        return [makeTrack()];
      });

      const { discoverLinksForReleases } = await import(
        '@/lib/discography/discovery'
      );

      const results = await discoverLinksForReleases([
        { releaseId: 'release-a', existingProviders: [] },
        { releaseId: 'release-b', existingProviders: [] },
        { releaseId: 'release-c', existingProviders: [] },
      ]);

      expect(results).toHaveLength(3);
      expect(results[1].errors).toContain('No tracks found for release');
      // Third release should still be processed
      expect(results[2].releaseId).toBe('release-c');
    });
  });
});
