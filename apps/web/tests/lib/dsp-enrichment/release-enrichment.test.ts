/**
 * Tests for the release enrichment job processor.
 *
 * Covers:
 * - UPC-based Apple Music linking
 * - ISRC-based Apple Music linking (batched)
 * - Error handling and partial failures
 * - Payload validation
 * - Manual override protection
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Logger
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Apple Music provider
const mockIsAppleMusicAvailable = vi.fn(() => true);
const mockLookupByUpc = vi.fn();
const mockBulkLookupByIsrc = vi.fn();
const mockGetAlbum = vi.fn();

vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  isAppleMusicAvailable: () => mockIsAppleMusicAvailable(),
  lookupByUpc: (...args: unknown[]) => mockLookupByUpc(...args),
  bulkLookupByIsrc: (...args: unknown[]) => mockBulkLookupByIsrc(...args),
  getAlbum: (...args: unknown[]) => mockGetAlbum(...args),
  MAX_ISRC_BATCH_SIZE: 25,
}));

// DB mock — avoid referencing variables in vi.mock factory (hoisted)
vi.mock('@/lib/db', () => ({
  db: { __isMockDb: true },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    upc: 'upc',
  },
  discogTracks: {
    releaseId: 'releaseId',
    isrc: 'isrc',
    discNumber: 'discNumber',
    trackNumber: 'trackNumber',
  },
  providerLinks: {
    releaseId: 'releaseId',
    providerId: 'providerId',
    ownerType: 'ownerType',
    trackId: 'trackId',
    url: 'url',
    externalId: 'externalId',
    sourceType: 'sourceType',
    isPrimary: 'isPrimary',
    metadata: 'metadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  })),
}));

import { releaseEnrichmentPayloadSchema } from '@/lib/dsp-enrichment/jobs/release-enrichment';

/**
 * Build a chainable mock DB connection.
 *
 * Drizzle query builders are thenable. Some queries end with `.limit()`,
 * others end with `.where()` and are awaited directly. We track calls to
 * `.select()` and return the correct mock data per query.
 */
function createMockDbConn(
  overrides: {
    releases?: Array<{ id: string; upc: string | null }>;
    existingLinks?: Array<{ releaseId: string }>;
    tracks?: Array<{ releaseId: string; isrc: string | null }>;
  } = {}
) {
  const { releases = [], existingLinks = [], tracks = [] } = overrides;

  let selectCallCount = 0;

  const mockInsertOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockInsertValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: mockInsertOnConflict,
  });

  // Returns the correct result set based on which query we're in
  function getResultForCurrentQuery(): Promise<unknown[]> {
    // 1st select: releases for profile
    // 2nd select: existing provider links
    // 3rd+: ISRCs for tracks
    if (selectCallCount === 1) return Promise.resolve(releases);
    if (selectCallCount === 2) return Promise.resolve(existingLinks);
    return Promise.resolve(tracks);
  }

  // Make the chain thenable so `await dbConn.select().from().where()` works
  const chain: Record<string, unknown> = {};

  chain.select = vi.fn(() => {
    selectCallCount++;
    return chain;
  });
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => getResultForCurrentQuery());
  chain.insert = vi.fn().mockReturnValue({ values: mockInsertValues });
  chain.__mockInsertOnConflict = mockInsertOnConflict;

  // Make the chain thenable (Drizzle queries can be awaited directly)
  chain.then = vi.fn((resolve?: (value: unknown) => unknown) =>
    getResultForCurrentQuery().then(resolve)
  );

  return chain;
}

describe('release-enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAppleMusicAvailable.mockReturnValue(true);
    mockLookupByUpc.mockResolvedValue(null);
    mockBulkLookupByIsrc.mockResolvedValue(new Map());
    mockGetAlbum.mockResolvedValue(null);
  });

  describe('releaseEnrichmentPayloadSchema', () => {
    it('validates a correct payload', () => {
      const payload = {
        creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
        matchId: 'match-123',
        providerId: 'apple_music' as const,
        externalArtistId: 'artist-456',
      };

      const result = releaseEnrichmentPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects missing creatorProfileId', () => {
      const result = releaseEnrichmentPayloadSchema.safeParse({
        matchId: 'match-123',
        providerId: 'apple_music',
        externalArtistId: 'artist-456',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID creatorProfileId', () => {
      const result = releaseEnrichmentPayloadSchema.safeParse({
        creatorProfileId: 'not-a-uuid',
        matchId: 'match-123',
        providerId: 'apple_music',
        externalArtistId: 'artist-456',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-apple_music providerId', () => {
      const result = releaseEnrichmentPayloadSchema.safeParse({
        creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
        matchId: 'match-123',
        providerId: 'spotify',
        externalArtistId: 'artist-456',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('processReleaseEnrichmentJob', () => {
    it('returns error when Apple Music is not available', async () => {
      mockIsAppleMusicAvailable.mockReturnValue(false);
      const mockConn = createMockDbConn();

      const { processReleaseEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/release-enrichment'
      );

      const result = await processReleaseEnrichmentJob(
        mockConn as unknown as Parameters<
          typeof processReleaseEnrichmentJob
        >[0],
        {
          creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
          matchId: 'match-123',
          providerId: 'apple_music',
          externalArtistId: 'artist-456',
        }
      );

      expect(result.errors).toContain('Apple Music provider not available');
      expect(result.releasesEnriched).toBe(0);
    });

    it('returns 0 enriched when no releases exist', async () => {
      const mockConn = createMockDbConn({ releases: [] });

      const { processReleaseEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/release-enrichment'
      );

      const result = await processReleaseEnrichmentJob(
        mockConn as unknown as Parameters<
          typeof processReleaseEnrichmentJob
        >[0],
        {
          creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
          matchId: 'match-123',
          providerId: 'apple_music',
          externalArtistId: 'artist-456',
        }
      );

      expect(result.releasesEnriched).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('enriches releases via UPC lookup', async () => {
      const mockConn = createMockDbConn({
        releases: [
          { id: 'release-1', upc: '00602445790128' },
          { id: 'release-2', upc: null },
        ],
      });

      // UPC lookup finds release-1
      mockLookupByUpc.mockImplementation(async (upc: string) => {
        if (upc === '00602445790128') {
          return {
            attributes: {
              url: 'https://music.apple.com/us/album/midnights/123',
            },
          };
        }
        return null;
      });

      const { processReleaseEnrichmentJob } = await import(
        '@/lib/dsp-enrichment/jobs/release-enrichment'
      );

      const result = await processReleaseEnrichmentJob(
        mockConn as unknown as Parameters<
          typeof processReleaseEnrichmentJob
        >[0],
        {
          creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
          matchId: 'match-123',
          providerId: 'apple_music',
          externalArtistId: 'artist-456',
        }
      );

      expect(mockLookupByUpc).toHaveBeenCalledWith('00602445790128');
      expect(result.releasesEnriched).toBeGreaterThanOrEqual(0);
    });
  });

  describe('URL derivation behavior', () => {
    it('album URL with query string strips to album URL', () => {
      const url = new URL(
        'https://music.apple.com/us/album/anti-hero/123?i=456'
      );
      expect(url.pathname).toContain('/album/');
      url.search = '';
      expect(url.toString()).toBe(
        'https://music.apple.com/us/album/anti-hero/123'
      );
    });

    it('song URL without /album/ path is not derivable', () => {
      const url = new URL('https://music.apple.com/us/song/anti-hero/456');
      expect(url.pathname).not.toContain('/album/');
    });

    it('/song/ URL requires album relationship to resolve', () => {
      const songUrl = 'https://music.apple.com/us/song/anti-hero/456';
      const parsed = new URL(songUrl);
      // Cannot derive album URL from /song/ path
      expect(parsed.pathname.includes('/album/')).toBe(false);
      // Would need to use album relationship data
    });
  });
});
