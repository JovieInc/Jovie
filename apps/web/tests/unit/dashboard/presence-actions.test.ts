import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadDspPresence,
  loadDspPresenceForProfile,
} from '@/app/app/(shell)/dashboard/presence/actions';
import type { DspMatchConfidenceBreakdown } from '@/lib/db/schema/dsp-enrichment';

const { dashboardQueryMock, getDashboardDataMock } = vi.hoisted(() => ({
  dashboardQueryMock: vi.fn(),
  getDashboardDataMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn().mockResolvedValue({ userId: 'user-abc' }),
}));

// Mock DB with chainable select for the ownership check
vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue([{ id: 'profile-123' }]);
  return { db: chain };
});

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/db/query-timeout', () => ({
  dashboardQuery: dashboardQueryMock,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: getDashboardDataMock,
}));

const confidenceBreakdown: DspMatchConfidenceBreakdown = {
  isrcMatchScore: 0.8,
  upcMatchScore: 0.4,
  nameSimilarityScore: 0.9,
  followerRatioScore: 0.3,
  genreOverlapScore: 0.2,
};

describe('presence actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters rejected matches, sorts statuses, and normalizes nullable fields', async () => {
    dashboardQueryMock.mockResolvedValueOnce([
      {
        matchId: 'confirmed',
        providerId: 'apple_music',
        externalArtistName: 'Confirmed Artist',
        externalArtistUrl: 'https://music.apple.com/artist/confirmed',
        externalArtistImageUrl: null,
        confidenceScore: null,
        confidenceBreakdown: null,
        matchingIsrcCount: 2,
        status: 'confirmed',
        matchSource: 'musicfetch',
        confirmedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
      {
        matchId: 'rejected',
        providerId: 'deezer',
        externalArtistName: 'Rejected Artist',
        externalArtistUrl: 'https://www.deezer.com/artist/rejected',
        externalArtistImageUrl: null,
        confidenceScore: '0.1000',
        confidenceBreakdown,
        matchingIsrcCount: 1,
        status: 'rejected',
        matchSource: 'musicfetch',
        confirmedAt: null,
      },
      {
        matchId: 'suggested',
        providerId: 'spotify',
        externalArtistName: null,
        externalArtistUrl: null,
        externalArtistImageUrl: 'https://i.scdn.co/image/artist',
        confidenceScore: '0.8750',
        confidenceBreakdown,
        matchingIsrcCount: 7,
        status: 'suggested',
        matchSource: 'isrc_discovery',
        confirmedAt: null,
      },
      {
        matchId: 'auto-confirmed',
        providerId: 'youtube_music',
        externalArtistName: 'Auto Confirmed Artist',
        externalArtistUrl: 'https://music.youtube.com/channel/artist',
        externalArtistImageUrl: null,
        confidenceScore: '0.7500',
        confidenceBreakdown: null,
        matchingIsrcCount: 4,
        status: 'auto_confirmed',
        matchSource: 'backfill',
        confirmedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);

    const result = await loadDspPresenceForProfile('profile-123');

    expect(result.items.map(item => item.matchId)).toEqual([
      'suggested',
      'auto-confirmed',
      'confirmed',
    ]);
    expect(result.items[0]).toMatchObject({
      externalArtistName: null,
      externalArtistUrl: null,
      externalArtistImageUrl: 'https://i.scdn.co/image/artist',
      confidenceScore: 0.875,
      confidenceBreakdown,
      confirmedAt: null,
    });
    expect(result.items[1].confirmedAt).toBe('2026-04-02T00:00:00.000Z');
    expect(result.confirmedCount).toBe(2);
    expect(result.suggestedCount).toBe(1);
  });

  it('rethrows query failures so the page can render a truthful error state', async () => {
    const error = new Error('presence query failed');
    dashboardQueryMock.mockRejectedValueOnce(error);

    await expect(loadDspPresenceForProfile('profile-456')).rejects.toThrow(
      'presence query failed'
    );
  });

  it('loads presence for the selected dashboard profile', async () => {
    getDashboardDataMock.mockResolvedValueOnce({
      needsOnboarding: false,
      selectedProfile: {
        id: 'profile-789',
      },
    });
    dashboardQueryMock.mockResolvedValueOnce([]);

    const result = await loadDspPresence();

    expect(result).toEqual({
      items: [],
      confirmedCount: 0,
      suggestedCount: 0,
    });
    expect(dashboardQueryMock).toHaveBeenCalledTimes(1);
  });
});
