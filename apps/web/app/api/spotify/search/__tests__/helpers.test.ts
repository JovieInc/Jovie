import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/contracts/api';

// Hoist mocks so vi.mock factories can reference them
const { mockSelect, claimedResult } = vi.hoisted(() => {
  const _claimedResult = { value: [] as unknown[] };
  const _mockWhere = vi
    .fn()
    .mockImplementation(() => Promise.resolve(_claimedResult.value));
  const _mockFrom = vi.fn().mockReturnValue({ where: _mockWhere });
  const _mockSelect = vi.fn().mockReturnValue({ from: _mockFrom });
  return {
    mockSelect: _mockSelect,
    mockFrom: _mockFrom,
    mockWhere: _mockWhere,
    claimedResult: _claimedResult,
  };
});

vi.mock('@/lib/featured-creators', () => ({
  getFeaturedCreatorsForSearch: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    spotifyId: 'spotifyId',
    isClaimed: 'isClaimed',
  },
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: Function) => fn,
}));

vi.mock('@/lib/spotify', () => ({
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { getFeaturedCreatorsForSearch } from '@/lib/featured-creators';
import { annotateClaimedStatus, applyVipBoost, parseLimit } from '../helpers';

const mockGetFeatured = vi.mocked(getFeaturedCreatorsForSearch);

function makeResult(
  overrides: Partial<SpotifyArtistResult> & { id: string; name: string }
): SpotifyArtistResult {
  return {
    url: `https://open.spotify.com/artist/${overrides.id}`,
    popularity: 50,
    followers: 1000,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('applyVipBoost', () => {
  it('returns results unchanged when no VIP match', async () => {
    mockGetFeatured.mockResolvedValue(new Map());

    const results = [
      makeResult({ id: 'a1', name: 'Tim White', followers: 277 }),
      makeResult({ id: 'a2', name: 'Peter White', followers: 115000 }),
    ];

    const boosted = await applyVipBoost(results, 'tim white', 5);
    expect(boosted).toEqual(results);
  });

  it('moves VIP artist to top when already in results', async () => {
    const vipMap = new Map([
      [
        'tim white',
        {
          spotifyId: 'vip-id',
          name: 'Tim White',
          imageUrl: null,
          followers: 9900,
          popularity: 60,
        },
      ],
    ]);
    mockGetFeatured.mockResolvedValue(vipMap);

    const results = [
      makeResult({ id: 'a1', name: 'Tim White', followers: 277 }),
      makeResult({ id: 'vip-id', name: 'Tim White', followers: 9900 }),
      makeResult({ id: 'a3', name: 'Peter White', followers: 115000 }),
    ];

    const boosted = await applyVipBoost(results, 'tim white', 5);

    // VIP should be first
    expect(boosted[0].id).toBe('vip-id');
    // Other Tim White should be filtered out
    expect(boosted.find(r => r.id === 'a1')).toBeUndefined();
    // Peter White should remain
    expect(boosted.find(r => r.id === 'a3')).toBeDefined();
  });

  it('synthesizes VIP result when not in results and filters same-name', async () => {
    const vipMap = new Map([
      [
        'tim white',
        {
          spotifyId: 'vip-id',
          name: 'Tim White',
          imageUrl: 'https://example.com/avatar.jpg',
          followers: 9900,
          popularity: 60,
        },
      ],
    ]);
    mockGetFeatured.mockResolvedValue(vipMap);

    const results = [
      makeResult({ id: 'a1', name: 'Tim White', followers: 277 }),
      makeResult({ id: 'a2', name: 'Tim White', followers: 264 }),
      makeResult({ id: 'a3', name: 'Peter White', followers: 115000 }),
    ];

    const boosted = await applyVipBoost(results, 'tim white', 5);

    // VIP synthesized at top
    expect(boosted[0].id).toBe('vip-id');
    expect(boosted[0].name).toBe('Tim White');
    expect(boosted[0].followers).toBe(9900);
    // Other Tim Whites filtered
    expect(boosted.find(r => r.id === 'a1')).toBeUndefined();
    expect(boosted.find(r => r.id === 'a2')).toBeUndefined();
    // Peter White remains
    expect(boosted.find(r => r.id === 'a3')).toBeDefined();
    expect(boosted).toHaveLength(2);
  });

  it('keeps non-matching names when VIP match found', async () => {
    const vipMap = new Map([
      [
        'tim white',
        {
          spotifyId: 'vip-id',
          name: 'Tim White',
          imageUrl: null,
          followers: 9900,
          popularity: 60,
        },
      ],
    ]);
    mockGetFeatured.mockResolvedValue(vipMap);

    const results = [
      makeResult({ id: 'a1', name: 'Jim White', followers: 26000 }),
      makeResult({ id: 'a2', name: 'Peter White', followers: 115000 }),
    ];

    const boosted = await applyVipBoost(results, 'tim white', 5);

    // VIP synthesized at top, others kept
    expect(boosted[0].id).toBe('vip-id');
    expect(boosted.find(r => r.id === 'a1')).toBeDefined();
    expect(boosted.find(r => r.id === 'a2')).toBeDefined();
    expect(boosted).toHaveLength(3);
  });

  it('returns results unchanged on VIP lookup failure', async () => {
    mockGetFeatured.mockRejectedValue(new Error('DB timeout'));

    const results = [makeResult({ id: 'a1', name: 'Tim White' })];
    const boosted = await applyVipBoost(results, 'tim white', 5);

    expect(boosted).toEqual(results);
  });

  it('VIP at top with no same-name collisions returns unchanged order', async () => {
    const vipMap = new Map([
      [
        'tim white',
        {
          spotifyId: 'vip-id',
          name: 'Tim White',
          imageUrl: null,
          followers: 9900,
          popularity: 60,
        },
      ],
    ]);
    mockGetFeatured.mockResolvedValue(vipMap);

    const results = [
      makeResult({ id: 'vip-id', name: 'Tim White', followers: 9900 }),
      makeResult({ id: 'a2', name: 'Peter White', followers: 115000 }),
    ];

    const boosted = await applyVipBoost(results, 'tim white', 5);

    expect(boosted[0].id).toBe('vip-id');
    expect(boosted[1].id).toBe('a2');
    expect(boosted).toHaveLength(2);
  });
});

describe('annotateClaimedStatus', () => {
  it('returns empty array unchanged', async () => {
    const result = await annotateClaimedStatus([]);
    expect(result).toEqual([]);
  });

  it('marks claimed artists with isClaimed: true', async () => {
    claimedResult.value = [{ spotifyId: 'claimed-id' }];

    const results = [
      makeResult({ id: 'claimed-id', name: 'Claimed Artist' }),
      makeResult({ id: 'unclaimed-id', name: 'Free Artist' }),
    ];

    const annotated = await annotateClaimedStatus(results);

    expect(annotated[0].isClaimed).toBe(true);
    expect(annotated[1].isClaimed).toBeUndefined();
  });

  it('returns results unchanged when none are claimed', async () => {
    claimedResult.value = [];

    const results = [
      makeResult({ id: 'a1', name: 'Artist A' }),
      makeResult({ id: 'a2', name: 'Artist B' }),
    ];

    const annotated = await annotateClaimedStatus(results);

    expect(annotated[0].isClaimed).toBeUndefined();
    expect(annotated[1].isClaimed).toBeUndefined();
  });

  it('returns results unchanged on DB error', async () => {
    mockSelect.mockImplementationOnce(() => {
      throw new Error('Connection refused');
    });

    const results = [makeResult({ id: 'a1', name: 'Artist A' })];
    const annotated = await annotateClaimedStatus(results);

    expect(annotated).toEqual(results);
  });
});

describe('parseLimit', () => {
  it('returns default when no param', () => {
    expect(parseLimit(null, 5, 10)).toBe(5);
  });

  it('parses valid integer', () => {
    expect(parseLimit('3', 5, 10)).toBe(3);
  });

  it('clamps to max', () => {
    expect(parseLimit('20', 5, 10)).toBe(10);
  });

  it('returns default for NaN', () => {
    expect(parseLimit('abc', 5, 10)).toBe(5);
  });

  it('returns default for zero', () => {
    expect(parseLimit('0', 5, 10)).toBe(5);
  });

  it('returns default for negative', () => {
    expect(parseLimit('-1', 5, 10)).toBe(5);
  });
});
