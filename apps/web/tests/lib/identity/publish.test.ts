/**
 * Unit tests for publishIdentityLinks()
 *
 * Covers:
 * - Returns {inserted:0, updated:0} when no identity links exist
 * - Only publishes streaming category links
 * - Does NOT publish video or metadata category links
 * - Applies source filter correctly
 * - Handles non-array DB responses gracefully
 * - Handles DB errors (table missing) gracefully
 * - Delegates to normalizeAndMergeExtraction with correct ExtractionResult
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/db/schema/identity', () => ({
  artistIdentityLinks: {
    creatorProfileId: 'creatorProfileId',
    source: 'source',
    platform: 'platform',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

// Mock normalizeAndMergeExtraction
const mockNormalizeAndMergeExtraction = vi.fn().mockResolvedValue({
  inserted: 0,
  updated: 0,
});

vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: (...args: unknown[]) =>
    mockNormalizeAndMergeExtraction(...args),
}));

import { publishIdentityLinks } from '@/lib/identity/publish';

// ─────────────────────────────────────────────────────────────────────────────
// Mock TX builder
// ─────────────────────────────────────────────────────────────────────────────

function createMockTx(queryResult: unknown = []) {
  const mockWhere = vi.fn().mockResolvedValue(queryResult);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    select: mockSelect,
    _mocks: { mockSelect, mockFrom, mockWhere },
  };
}

function createErrorMockTx() {
  const mockWhere = vi
    .fn()
    .mockRejectedValue(
      new Error('relation "artist_identity_links" does not exist')
    );
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    select: mockSelect,
    _mocks: { mockSelect, mockFrom, mockWhere },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  usernameNormalized: 'testartist',
  avatarUrl: null,
  displayName: 'Test Artist',
  avatarLockedByUser: false,
  displayNameLocked: false,
};

function makeIdentityLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-uuid-1',
    creatorProfileId: PROFILE.id,
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/123',
    externalId: '123',
    source: 'musicfetch',
    sourceRequestUrl: 'https://api.musicfetch.io/artist?url=spotify:123',
    rawPayload: {},
    fetchedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('publishIdentityLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 0,
      updated: 0,
    });
  });

  it('returns {inserted:0, updated:0} when no identity links exist', async () => {
    const mockTx = createMockTx([]);

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).not.toHaveBeenCalled();
  });

  it('publishes streaming category links (spotify, apple_music, deezer)', async () => {
    const links = [
      makeIdentityLink({
        id: 'link-1',
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-2',
        platform: 'apple_music',
        url: 'https://music.apple.com/us/artist/test/123456',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-3',
        platform: 'deezer',
        url: 'https://www.deezer.com/artist/789012',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);

    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 3,
      updated: 0,
    });

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 3, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).toHaveBeenCalledTimes(1);

    // Verify the extraction passed to normalizeAndMergeExtraction
    const extractionArg = mockNormalizeAndMergeExtraction.mock.calls[0][2];
    expect(extractionArg.links.length).toBeGreaterThan(0);
    for (const link of extractionArg.links) {
      expect(link.evidence?.signals).toContain('musicfetch_artist_lookup');
    }
  });

  it('does NOT publish video category links (tiktok, instagram)', async () => {
    const links = [
      makeIdentityLink({
        id: 'link-1',
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@testartist',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-2',
        platform: 'instagram',
        url: 'https://www.instagram.com/testartist',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    // No publishable links → normalizeAndMergeExtraction not called
    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).not.toHaveBeenCalled();
  });

  it('does NOT publish metadata category links (genius, discogs)', async () => {
    const links = [
      makeIdentityLink({
        id: 'link-1',
        platform: 'genius',
        url: 'https://genius.com/artists/test-artist',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-2',
        platform: 'discogs',
        url: 'https://www.discogs.com/artist/123456',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).not.toHaveBeenCalled();
  });

  it('filters by source when sourceFilter option is provided', async () => {
    const links = [
      makeIdentityLink({
        id: 'link-1',
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-2',
        platform: 'deezer',
        url: 'https://www.deezer.com/artist/789012',
        source: 'serp',
      }),
    ];
    const mockTx = createMockTx(links);

    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 1,
      updated: 0,
    });

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE,
      { sourceFilter: 'musicfetch' }
    );

    expect(result).toEqual({ inserted: 1, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).toHaveBeenCalledTimes(1);

    // The extraction should only contain the musicfetch link
    const extractionArg = mockNormalizeAndMergeExtraction.mock.calls[0][2];
    expect(extractionArg.sourcePlatform).toBe('musicfetch');
  });

  it('handles non-array DB response gracefully (returns empty result)', async () => {
    // Some mock scenarios return undefined or null instead of an array
    const mockTx = createMockTx(undefined);

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).not.toHaveBeenCalled();
  });

  it('handles DB errors gracefully (table not yet migrated)', async () => {
    const mockTx = createErrorMockTx();

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).not.toHaveBeenCalled();
  });

  it('passes correct profile to normalizeAndMergeExtraction', async () => {
    const links = [
      makeIdentityLink({
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);
    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 1,
      updated: 0,
    });

    await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(mockNormalizeAndMergeExtraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: PROFILE.id,
        usernameNormalized: PROFILE.usernameNormalized,
      }),
      expect.objectContaining({
        links: expect.any(Array),
        sourcePlatform: expect.any(String),
        sourceUrl: null,
      })
    );
  });

  it('uses identity_layer as sourcePlatform when no sourceFilter specified', async () => {
    const links = [
      makeIdentityLink({
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);
    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 1,
      updated: 0,
    });

    await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    const extractionArg = mockNormalizeAndMergeExtraction.mock.calls[0][2];
    expect(extractionArg.sourcePlatform).toBe('identity_layer');
  });

  it('mixes streaming and non-streaming — only streaming gets published', async () => {
    const links = [
      makeIdentityLink({
        id: 'link-1',
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-2',
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@testartist',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-3',
        platform: 'genius',
        url: 'https://genius.com/artists/test-artist',
        source: 'musicfetch',
      }),
      makeIdentityLink({
        id: 'link-4',
        platform: 'deezer',
        url: 'https://www.deezer.com/artist/789012',
        source: 'musicfetch',
      }),
    ];
    const mockTx = createMockTx(links);
    mockNormalizeAndMergeExtraction.mockResolvedValue({
      inserted: 2,
      updated: 0,
    });

    const result = await publishIdentityLinks(
      mockTx as unknown as Parameters<typeof publishIdentityLinks>[0],
      PROFILE
    );

    expect(result).toEqual({ inserted: 2, updated: 0 });
    expect(mockNormalizeAndMergeExtraction).toHaveBeenCalledTimes(1);

    // Verify only streaming links were passed
    const extractionArg = mockNormalizeAndMergeExtraction.mock.calls[0][2];
    const platformIds = extractionArg.links.map(
      (l: { platformId: string }) => l.platformId
    );

    // spotify and deezer are streaming → should be present
    // tiktok (video) and genius (metadata) → should NOT be present
    expect(platformIds).not.toContain('tiktok');
    expect(platformIds).not.toContain('genius');
  });
});
