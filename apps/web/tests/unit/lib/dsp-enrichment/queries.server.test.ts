import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (left: unknown, right: unknown) => [left, right],
}));

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  dspArtistMatches: {
    id: 'dsp_artist_matches.id',
    creatorProfileId: 'dsp_artist_matches.creator_profile_id',
    providerId: 'dsp_artist_matches.provider_id',
    externalArtistId: 'dsp_artist_matches.external_artist_id',
    externalArtistName: 'dsp_artist_matches.external_artist_name',
    externalArtistUrl: 'dsp_artist_matches.external_artist_url',
    externalArtistImageUrl: 'dsp_artist_matches.external_artist_image_url',
    confidenceScore: 'dsp_artist_matches.confidence_score',
    confidenceBreakdown: 'dsp_artist_matches.confidence_breakdown',
    matchingIsrcCount: 'dsp_artist_matches.matching_isrc_count',
    matchingUpcCount: 'dsp_artist_matches.matching_upc_count',
    totalTracksChecked: 'dsp_artist_matches.total_tracks_checked',
    status: 'dsp_artist_matches.status',
    createdAt: 'dsp_artist_matches.created_at',
    updatedAt: 'dsp_artist_matches.updated_at',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creator_profiles.id',
    userId: 'creator_profiles.user_id',
  },
}));

function profileQuery(profile: { id: string; userId: string }[]) {
  return {
    from: () => ({
      where: () => ({
        limit: async () => profile,
      }),
    }),
  };
}

function matchesQuery(matches: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => matches,
        }),
      }),
    }),
  };
}

describe('getDspMatchesForProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns matches when the canonical app user owns the profile', async () => {
    const matches = [{ id: 'match_1', confidenceScore: '0.95' }];
    mockSelect
      .mockReturnValueOnce(
        profileQuery([{ id: 'profile_1', userId: 'user_1' }])
      )
      .mockReturnValueOnce(matchesQuery(matches));

    const { getDspMatchesForProfile } = await import(
      '@/lib/dsp-enrichment/queries.server'
    );

    await expect(
      getDspMatchesForProfile('profile_1', 'user_1')
    ).resolves.toEqual([{ id: 'match_1', confidenceScore: 0.95 }]);
    expect(mockSelect.mock.calls[0]?.[0]).toEqual({
      id: 'creator_profiles.id',
      userId: 'creator_profiles.user_id',
    });
  });

  it('rejects a non-owner and does not load matches', async () => {
    mockSelect.mockReturnValueOnce(
      profileQuery([{ id: 'profile_1', userId: 'user_owner' }])
    );

    const { getDspMatchesForProfile } = await import(
      '@/lib/dsp-enrichment/queries.server'
    );

    await expect(
      getDspMatchesForProfile('profile_1', 'user_other')
    ).rejects.toThrow('You do not have permission to view this profile');
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
