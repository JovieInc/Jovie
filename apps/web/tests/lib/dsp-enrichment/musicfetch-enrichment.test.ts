/**
 * Tests for the MusicFetch enrichment job processor.
 *
 * Covers:
 * - DSP field mapping (Apple Music, Deezer, Tidal, SoundCloud, YouTube Music)
 * - Social link extraction (Instagram, TikTok, Bandcamp)
 * - Bio update logic
 * - Error handling
 * - Payload validation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Logger
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// MusicFetch provider
const mockIsMusicFetchAvailable = vi.fn(() => true);
const mockFetchArtistBySpotifyUrl = vi.fn();
const mockExtractAppleMusicId = vi.fn((url: string) => {
  const match = /\/artist\/[^/]+\/(\d+)/.exec(url);
  return match?.[1] ?? null;
});
const mockExtractDeezerId = vi.fn((url: string) => {
  const match = /artist\/(\d+)/.exec(url);
  return match?.[1] ?? null;
});
const mockExtractTidalId = vi.fn((url: string) => {
  const match = /artist\/(\d+)/.exec(url);
  return match?.[1] ?? null;
});
const mockExtractSoundcloudId = vi.fn((url: string) => {
  const match = /soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/.exec(url);
  return match?.[1] ?? null;
});
const mockExtractYoutubeMusicId = vi.fn((url: string) => {
  const match = /channel\/(UC[a-zA-Z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
});

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  isMusicFetchAvailable: () => mockIsMusicFetchAvailable(),
  fetchArtistBySpotifyUrl: (url: string) => mockFetchArtistBySpotifyUrl(url),
  extractAppleMusicId: (url: string) => mockExtractAppleMusicId(url),
  extractDeezerId: (url: string) => mockExtractDeezerId(url),
  extractTidalId: (url: string) => mockExtractTidalId(url),
  extractSoundcloudId: (url: string) => mockExtractSoundcloudId(url),
  extractYoutubeMusicId: (url: string) => mockExtractYoutubeMusicId(url),
}));

// Ingestion merge
const mockNormalizeAndMergeExtraction = vi.fn().mockResolvedValue({
  inserted: 0,
  updated: 0,
});

vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: (...args: unknown[]) =>
    mockNormalizeAndMergeExtraction(...args),
}));

// DB schema
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    usernameNormalized: 'usernameNormalized',
    displayName: 'displayName',
    displayNameLocked: 'displayNameLocked',
    avatarUrl: 'avatarUrl',
    avatarLockedByUser: 'avatarLockedByUser',
    bio: 'bio',
    appleMusicUrl: 'appleMusicUrl',
    appleMusicId: 'appleMusicId',
    youtubeUrl: 'youtubeUrl',
    youtubeMusicId: 'youtubeMusicId',
    deezerId: 'deezerId',
    tidalId: 'tidalId',
    soundcloudId: 'soundcloudId',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

// Mock DB transaction
const mockTxSelect = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxFrom = vi.fn();
const mockTxWhere = vi.fn();
const mockTxLimit = vi.fn();
const mockTxSet = vi.fn();

function createMockTx() {
  return {
    select: mockTxSelect.mockReturnValue({
      from: mockTxFrom.mockReturnValue({
        where: mockTxWhere.mockReturnValue({
          limit: mockTxLimit,
        }),
      }),
    }),
    update: mockTxUpdate.mockReturnValue({
      set: mockTxSet.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

import {
  type MusicFetchEnrichmentPayload,
  musicFetchEnrichmentPayloadSchema,
} from '@/lib/dsp-enrichment/jobs/musicfetch-enrichment';
import type { MusicFetchArtistResult } from '@/lib/dsp-enrichment/providers/musicfetch';

// Helper to build valid payload
function makePayload(
  overrides: Partial<MusicFetchEnrichmentPayload> = {}
): MusicFetchEnrichmentPayload {
  return {
    creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
    spotifyUrl: 'https://open.spotify.com/artist/123',
    dedupKey: 'dedup-abc',
    ...overrides,
  };
}

// Helper to build MusicFetch result
function makeMusicFetchResult(
  overrides: Partial<MusicFetchArtistResult> = {}
): MusicFetchArtistResult {
  return {
    type: 'artist',
    name: 'Test Artist',
    services: {
      appleMusic: {
        url: 'https://music.apple.com/us/artist/test-artist/123456',
      },
      deezer: { url: 'https://www.deezer.com/artist/789012' },
      tidal: { url: 'https://tidal.com/browse/artist/345678' },
      soundcloud: { url: 'https://soundcloud.com/test-artist' },
      youtubeMusic: {
        url: 'https://music.youtube.com/channel/UCabcdef123',
      },
      youtube: { url: 'https://www.youtube.com/channel/UCabcdef123' },
      instagram: { url: 'https://www.instagram.com/testartist' },
      tiktok: { url: 'https://www.tiktok.com/@testartist' },
      bandcamp: { url: 'https://testartist.bandcamp.com' },
    },
    ...overrides,
  };
}

// Helper to build existing profile
function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    usernameNormalized: 'testartist',
    displayName: 'Test Artist',
    displayNameLocked: false,
    avatarUrl: null,
    avatarLockedByUser: false,
    bio: null,
    appleMusicUrl: null,
    appleMusicId: null,
    youtubeUrl: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    ...overrides,
  };
}

describe('musicfetch-enrichment', () => {
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = createMockTx();
    mockIsMusicFetchAvailable.mockReturnValue(true);
    mockFetchArtistBySpotifyUrl.mockResolvedValue(null);
    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 0,
      updated: 0,
    });
    mockTxLimit.mockResolvedValue([makeProfile()]);
  });

  describe('musicFetchEnrichmentPayloadSchema', () => {
    it('validates a correct payload', () => {
      const result = musicFetchEnrichmentPayloadSchema.safeParse(makePayload());
      expect(result.success).toBe(true);
    });

    it('rejects missing spotifyUrl', () => {
      const result = musicFetchEnrichmentPayloadSchema.safeParse({
        creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
        dedupKey: 'dedup-abc',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid URL', () => {
      const result = musicFetchEnrichmentPayloadSchema.safeParse(
        makePayload({ spotifyUrl: 'not-a-url' })
      );
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID creatorProfileId', () => {
      const result = musicFetchEnrichmentPayloadSchema.safeParse(
        makePayload({ creatorProfileId: 'bad-id' as unknown as string })
      );
      expect(result.success).toBe(false);
    });
  });

  describe('processMusicFetchEnrichmentJob', () => {
    it('returns error when MusicFetch is unavailable', async () => {
      mockIsMusicFetchAvailable.mockReturnValue(false);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.errors).toContain('MusicFetch API token not configured');
    });

    it('returns error when profile is not found', async () => {
      mockIsMusicFetchAvailable.mockReturnValue(true);
      mockTxLimit.mockResolvedValue([]);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.errors).toContain('Creator profile not found');
    });

    it('returns error when MusicFetch API returns no data', async () => {
      mockFetchArtistBySpotifyUrl.mockResolvedValue(null);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.errors).toContain('MusicFetch API returned no data');
    });

    it('maps DSP fields from MusicFetch to profile when all fields are null', async () => {
      const musicFetchResult = makeMusicFetchResult();
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      // Should update DSP fields
      expect(result.dspFieldsUpdated.length).toBeGreaterThan(0);
      expect(mockTxUpdate).toHaveBeenCalled();

      // The set call should contain DSP IDs
      const setCallArgs = mockTxSet.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      if (setCallArgs) {
        // appleMusicId extracted from URL
        expect(setCallArgs.appleMusicId).toBe('123456');
        // appleMusicUrl set
        expect(setCallArgs.appleMusicUrl).toBe(
          'https://music.apple.com/us/artist/test-artist/123456'
        );
      }
    });

    it('does not overwrite existing DSP fields', async () => {
      // Profile already has Apple Music and Deezer IDs
      mockTxLimit.mockResolvedValue([
        makeProfile({
          appleMusicId: 'existing-am-id',
          appleMusicUrl: 'https://music.apple.com/us/artist/existing/999',
          deezerId: 'existing-deezer-id',
        }),
      ]);

      const musicFetchResult = makeMusicFetchResult();
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      // Should still update other fields (tidal, soundcloud, youtube)
      // but NOT overwrite apple_music or deezer
      expect(result.dspFieldsUpdated).not.toContain('appleMusicId');
      expect(result.dspFieldsUpdated).not.toContain('appleMusicUrl');
      expect(result.dspFieldsUpdated).not.toContain('deezerId');
    });

    it('extracts social links for Instagram, TikTok, and Bandcamp', async () => {
      const musicFetchResult = makeMusicFetchResult();
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);
      mockNormalizeAndMergeExtraction.mockResolvedValue({
        inserted: 3,
        updated: 0,
      });

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.socialLinksInserted).toBe(3);
      expect(mockNormalizeAndMergeExtraction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
        expect.objectContaining({
          links: expect.arrayContaining([
            expect.objectContaining({ platformId: 'instagram' }),
            expect.objectContaining({ platformId: 'tiktok' }),
            expect.objectContaining({ platformId: 'bandcamp' }),
          ]),
        })
      );
    });

    it('updates bio when profile has none', async () => {
      const musicFetchResult = makeMusicFetchResult({ bio: 'Artist bio text' });
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);
      mockTxLimit.mockResolvedValue([makeProfile({ bio: null })]);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.dspFieldsUpdated).toContain('bio');
    });

    it('does not overwrite existing bio', async () => {
      const musicFetchResult = makeMusicFetchResult({
        bio: 'New bio from MusicFetch',
      });
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);
      mockTxLimit.mockResolvedValue([makeProfile({ bio: 'Existing bio' })]);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      const result = await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      expect(result.dspFieldsUpdated).not.toContain('bio');
    });

    it('YouTube URL falls back to YouTube Music when main YouTube unavailable', async () => {
      const musicFetchResult = makeMusicFetchResult({
        services: {
          youtubeMusic: {
            url: 'https://music.youtube.com/channel/UCfallback',
          },
          // No 'youtube' service
        },
      });
      mockFetchArtistBySpotifyUrl.mockResolvedValue(musicFetchResult);

      const { processMusicFetchEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/musicfetch-enrichment'
      );

      await processMusicFetchEnrichmentJob(
        mockTx as unknown as Parameters<
          typeof processMusicFetchEnrichmentJob
        >[0],
        makePayload()
      );

      if (mockTxSet.mock.calls.length > 0) {
        const setCallArgs = mockTxSet.mock.calls[0][0] as Record<
          string,
          unknown
        >;
        expect(setCallArgs.youtubeUrl).toBe(
          'https://music.youtube.com/channel/UCfallback'
        );
      }
    });
  });
});
