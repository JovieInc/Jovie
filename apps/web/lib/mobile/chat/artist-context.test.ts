import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const state = {
    selectCount: 0,
    limit: vi.fn(),
    statsQuery: vi.fn(),
    warn: vi.fn(),
  };

  return {
    ...state,
    resetSelectCount() {
      state.selectCount = 0;
    },
    select: vi.fn(() => {
      state.selectCount += 1;
      if (state.selectCount === 1) {
        return {
          from: () => ({
            where: () => ({
              limit: state.limit,
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => state.statsQuery(),
        }),
      };
    }),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: () => hoisted.select(),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: hoisted.warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  artistContextFromAuthorizedProfile,
  fetchMobileArtistContext,
} from '@/lib/mobile/chat/artist-context';

const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const AUTHORIZED = {
  displayName: 'Tim White',
  username: 'tim',
} as const;

describe('artistContextFromAuthorizedProfile', () => {
  it('builds chat identity from the session profile without DSP extras', () => {
    expect(artistContextFromAuthorizedProfile(AUTHORIZED)).toEqual({
      displayName: 'Tim White',
      username: 'tim',
      bio: null,
      genres: [],
      spotifyFollowers: null,
      spotifyPopularity: null,
      profileViews: 0,
      hasSocialLinks: false,
      hasMusicLinks: false,
      tippingStats: {
        tipClicks: 0,
        tipsSubmitted: 0,
        totalReceivedCents: 0,
        monthReceivedCents: 0,
      },
    });
  });

  it('returns null when the session profile has no username', () => {
    expect(
      artistContextFromAuthorizedProfile({
        displayName: 'Tim',
        username: '   ',
      })
    ).toBeNull();
  });
});

describe('fetchMobileArtistContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resetSelectCount();
    hoisted.statsQuery.mockResolvedValue([]);
  });

  it('uses the session-authorized identity when the extra profile lookup is empty', async () => {
    hoisted.limit.mockResolvedValue([]);

    const context = await fetchMobileArtistContext({
      profileId: PROFILE_ID,
      authorizedProfile: AUTHORIZED,
    });

    expect(context?.displayName).toBe('Tim White');
    expect(context?.username).toBe('tim');
  });

  it('uses the session-authorized identity when the extra profile lookup throws', async () => {
    hoisted.limit.mockRejectedValue(new Error('relation does not exist'));

    const context = await fetchMobileArtistContext({
      profileId: PROFILE_ID,
      authorizedProfile: AUTHORIZED,
    });

    expect(context?.username).toBe('tim');
    expect(hoisted.warn).toHaveBeenCalled();
  });

  it('still chats when extras fail after the profile row loads', async () => {
    hoisted.limit.mockResolvedValue([
      {
        displayName: 'Loaded Name',
        username: 'loaded',
        bio: 'bio',
        genres: ['indie'],
        spotifyFollowers: 12,
        spotifyPopularity: 40,
        spotifyUrl: null,
        appleMusicUrl: null,
        profileViews: 3,
      },
    ]);
    hoisted.statsQuery.mockRejectedValue(new Error('tips unavailable'));

    const context = await fetchMobileArtistContext({
      profileId: PROFILE_ID,
      authorizedProfile: AUTHORIZED,
    });

    expect(context).toMatchObject({
      displayName: 'Loaded Name',
      username: 'loaded',
      bio: 'bio',
      genres: ['indie'],
      hasSocialLinks: false,
      hasMusicLinks: false,
    });
  });
});
