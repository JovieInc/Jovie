import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
}));
vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: hoisted.getLiveMerchCardsForProfile,
}));
vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: hoisted.getUpcomingTourDatesForProfile,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

describe('GET /api/v1/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes protected synthetic identities from public API discovery', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/taylorswift'), {
      params: Promise.resolve({ username: 'taylorswift' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'Artist not found' });
    expect(hoisted.getProfileByUsername).not.toHaveBeenCalled();
  });

  it('keeps legitimate public profiles available', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
      bio: null,
      location: null,
      genres: [],
      avatarUrl: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
    });
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).artist.username).toBe('realartist');
  });
});
