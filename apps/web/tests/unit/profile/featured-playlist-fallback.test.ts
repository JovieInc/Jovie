import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const invalidateProfileCacheMock = vi.fn().mockResolvedValue(undefined);
  const captureErrorMock = vi.fn().mockResolvedValue(undefined);
  const selectResults: unknown[][] = [];
  const updateSetArgs: Array<Record<string, unknown>> = [];
  const discoverThisIsPlaylistCandidateMock = vi.fn();

  const selectMock = vi.fn(() => {
    const result = selectResults.shift() ?? [];
    const limitMock = vi.fn().mockResolvedValue(result);
    const whereMock = vi.fn(() => ({ limit: limitMock }));
    return { from: vi.fn(() => ({ where: whereMock })) };
  });

  const updateMock = vi.fn(() => ({
    set: vi.fn((args: Record<string, unknown>) => {
      updateSetArgs.push(args);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));

  return {
    captureErrorMock,
    discoverThisIsPlaylistCandidateMock,
    invalidateProfileCacheMock,
    selectMock,
    selectResults,
    updateMock,
    updateSetArgs,
  };
});

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: hoisted.invalidateProfileCacheMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    settings: 'settings',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('@/lib/profile/featured-playlist-fallback-discovery', () => ({
  discoverThisIsPlaylistCandidate: hoisted.discoverThisIsPlaylistCandidateMock,
}));

describe('featured playlist fallback settings helpers', () => {
  beforeEach(() => {
    hoisted.selectResults.length = 0;
    hoisted.updateSetArgs.length = 0;
    hoisted.discoverThisIsPlaylistCandidateMock.mockReset();
    hoisted.invalidateProfileCacheMock.mockClear();
  });

  it('writes a pending candidate and invalidates the public profile cache', async () => {
    hoisted.selectResults.push([{ settings: {} }]);
    hoisted.discoverThisIsPlaylistCandidateMock.mockResolvedValue({
      artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      discoveredAt: '2026-01-01T00:00:00.000Z',
      imageUrl: null,
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
      source: 'serp_html',
      title: 'This Is Tim White',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
    });

    const { refreshFeaturedPlaylistFallbackCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback'
    );

    await refreshFeaturedPlaylistFallbackCandidate({
      artistName: 'Tim White',
      artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      profileId: 'profile-1',
      usernameNormalized: 'timwhite',
    });

    expect(hoisted.updateSetArgs[0].settings).toEqual(
      expect.objectContaining({
        featuredPlaylistFallbackCandidate: expect.objectContaining({
          playlistId: '37i9dQZF1DZ06evO2SKVTu',
        }),
      })
    );
    expect(hoisted.invalidateProfileCacheMock).toHaveBeenCalledWith('timwhite');
  });

  it('does not re-add a dismissed playlist candidate', async () => {
    hoisted.selectResults.push([
      {
        settings: {
          featuredPlaylistFallbackDismissedId: '37i9dQZF1DZ06evO2SKVTu',
        },
      },
    ]);
    hoisted.discoverThisIsPlaylistCandidateMock.mockResolvedValue({
      artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      discoveredAt: '2026-01-01T00:00:00.000Z',
      imageUrl: null,
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
      source: 'serp_html',
      title: 'This Is Tim White',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
    });

    const { refreshFeaturedPlaylistFallbackCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback'
    );

    await refreshFeaturedPlaylistFallbackCandidate({
      artistName: 'Tim White',
      artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      profileId: 'profile-1',
      usernameNormalized: 'timwhite',
    });

    expect(hoisted.updateSetArgs).toHaveLength(0);
  });

  it('reads a confirmed fallback defensively from settings', async () => {
    const { getConfirmedFeaturedPlaylistFallback } = await import(
      '@/lib/profile/featured-playlist-fallback'
    );

    expect(
      getConfirmedFeaturedPlaylistFallback({
        featuredPlaylistFallback: {
          artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
          confirmedAt: '2026-01-01T00:00:00.000Z',
          discoveredAt: '2026-01-01T00:00:00.000Z',
          imageUrl: null,
          playlistId: '37i9dQZF1DZ06evO2SKVTu',
          searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
          source: 'serp_html',
          title: 'This Is Tim White',
          url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        },
      })
    ).toMatchObject({
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      title: 'This Is Tim White',
    });
  });
});
