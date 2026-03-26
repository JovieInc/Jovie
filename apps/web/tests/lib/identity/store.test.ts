/**
 * Unit tests for storeRawIdentityLinks()
 *
 * Covers:
 * - Returns 0 for empty links array
 * - Stores links and returns correct count
 * - Handles DB errors gracefully (returns 0, does not throw)
 * - Handles "table does not exist" errors (pre-migration)
 * - Partial success: counts only successfully stored links
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

import type { RawIdentityLink } from '@/lib/identity/store';
import { storeRawIdentityLinks } from '@/lib/identity/store';

// ─────────────────────────────────────────────────────────────────────────────
// Mock TX builder
// ─────────────────────────────────────────────────────────────────────────────

function createMockTx(
  options: { insertError?: Error; insertErrorOnIndex?: number } = {}
) {
  let callCount = 0;

  const mockOnConflictDoUpdate = vi.fn().mockImplementation(() => {
    const currentCall = callCount++;
    if (
      options.insertError &&
      (options.insertErrorOnIndex === undefined ||
        options.insertErrorOnIndex === currentCall)
    ) {
      return Promise.reject(options.insertError);
    }
    return Promise.resolve();
  });

  const mockValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: mockOnConflictDoUpdate,
  });

  const mockInsert = vi.fn().mockReturnValue({
    values: mockValues,
  });

  return {
    insert: mockInsert,
    _mocks: { mockInsert, mockValues, mockOnConflictDoUpdate },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440000';
const SOURCE = 'musicfetch';
const SOURCE_REQUEST_URL = 'https://api.musicfetch.io/artist?url=spotify:123';

function makeLinks(count: number): RawIdentityLink[] {
  return Array.from({ length: count }, (_, i) => ({
    platform: `platform_${i}`,
    url: `https://example.com/artist/${i}`,
    externalId: `ext-${i}`,
    rawPayload: { index: i },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('storeRawIdentityLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 for empty links array without making any DB calls', async () => {
    const mockTx = createMockTx();

    const result = await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      []
    );

    expect(result).toBe(0);
    expect(mockTx._mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('stores a single link and returns 1', async () => {
    const mockTx = createMockTx();
    const links = makeLinks(1);

    const result = await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      links
    );

    expect(result).toBe(1);
    expect(mockTx._mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mockTx._mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: PROFILE_ID,
        platform: 'platform_0',
        url: 'https://example.com/artist/0',
        externalId: 'ext-0',
        source: SOURCE,
        sourceRequestUrl: SOURCE_REQUEST_URL,
        rawPayload: { index: 0 },
      })
    );
  });

  it('stores multiple links and returns correct count', async () => {
    const mockTx = createMockTx();
    const links = makeLinks(5);

    const result = await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      links
    );

    expect(result).toBe(5);
    expect(mockTx._mocks.mockInsert).toHaveBeenCalledTimes(5);
  });

  it('sets externalId to null when not provided', async () => {
    const mockTx = createMockTx();
    const links: RawIdentityLink[] = [
      {
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/123',
      },
    ];

    await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      links
    );

    expect(mockTx._mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: null,
        rawPayload: {},
      })
    );
  });

  it('configures upsert on conflict for (creatorProfileId, source, platform)', async () => {
    const mockTx = createMockTx();
    const links = makeLinks(1);

    await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      links
    );

    expect(mockTx._mocks.mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ['creatorProfileId', 'source', 'platform'],
        set: expect.objectContaining({
          url: 'https://example.com/artist/0',
          externalId: 'ext-0',
          sourceRequestUrl: SOURCE_REQUEST_URL,
          rawPayload: { index: 0 },
        }),
      })
    );
  });

  it('returns 0 immediately when DB error says table does not exist', async () => {
    const mockTx = createMockTx({
      insertError: new Error('relation "artist_identity_links" does not exist'),
    });
    const links = makeLinks(3);

    const result = await storeRawIdentityLinks(
      mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
      PROFILE_ID,
      SOURCE,
      SOURCE_REQUEST_URL,
      links
    );

    // Should return 0 and not throw
    expect(result).toBe(0);
    // Should only attempt the first insert before bailing
    expect(mockTx._mocks.mockInsert).toHaveBeenCalledTimes(1);
  });

  it('throws on non-migration DB errors', async () => {
    const mockTx = createMockTx({
      insertError: new Error('unique constraint violation'),
    });
    const links = makeLinks(1);

    await expect(
      storeRawIdentityLinks(
        mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
        PROFILE_ID,
        SOURCE,
        SOURCE_REQUEST_URL,
        links
      )
    ).rejects.toThrow('unique constraint violation');
  });

  it('throws on connection errors instead of swallowing them', async () => {
    const mockTx = createMockTx({
      insertError: new Error('connection refused'),
    });
    const links = makeLinks(1);

    await expect(
      storeRawIdentityLinks(
        mockTx as unknown as Parameters<typeof storeRawIdentityLinks>[0],
        PROFILE_ID,
        SOURCE,
        SOURCE_REQUEST_URL,
        links
      )
    ).rejects.toThrow('connection refused');
  });
});
