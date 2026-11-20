import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getCachedPublicReleasesForProfile: vi.fn(),
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));

vi.mock('@/lib/releases/public-release-loader', () => ({
  getCachedPublicReleasesForProfile: hoisted.getCachedPublicReleasesForProfile,
}));

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
}));

describe('GET /[username]/feed.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes protected synthetic identities before profile lookup', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/dualipa/feed.xml'), {
      params: Promise.resolve({ username: 'dualipa' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.getProfileByUsername).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile is missing or private', async () => {
    const { GET } = await import('./route');

    hoisted.getProfileByUsername.mockResolvedValueOnce(null);
    const missing = await GET(
      new Request('https://jov.ie/realartist/feed.xml'),
      {
        params: Promise.resolve({ username: 'realartist' }),
      }
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');

    hoisted.getProfileByUsername.mockResolvedValueOnce({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: false,
    });
    const privateProfile = await GET(
      new Request('https://jov.ie/realartist/feed.xml'),
      { params: Promise.resolve({ username: 'realartist' }) }
    );
    expect(privateProfile.status).toBe(404);
    expect(privateProfile.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.getCachedPublicReleasesForProfile).not.toHaveBeenCalled();
  });

  it('keeps legitimate public artist feeds discoverable', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
    });
    hoisted.getCachedPublicReleasesForProfile.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/realartist/feed.xml'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
    expect(await res.text()).toContain('Real Artist — Releases');
  });
  it('withdraws a previously public feed and denies malformed publication without shared HTTP reuse', async () => {
    const { GET, dynamic, revalidate } = await import('./route');
    expect(dynamic).toBe('force-dynamic');
    expect(revalidate).toBe(0);
    hoisted.getCachedPublicReleasesForProfile.mockResolvedValue([]);
    for (const isPublic of [true, false, 'false', null]) {
      hoisted.getProfileByUsername.mockResolvedValue({
        id: 'profile-1',
        username: 'realartist',
        displayName: 'Real Artist',
        isPublic,
      });
      const response = await GET(
        new Request('https://jov.ie/realartist/feed.xml'),
        { params: Promise.resolve({ username: 'realartist' }) }
      );
      expect(response.status).toBe(isPublic === true ? 200 : 404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      if (isPublic !== true)
        expect(await response.text()).not.toContain('Real Artist');
    }
    expect(hoisted.getCachedPublicReleasesForProfile).toHaveBeenCalledTimes(1);
  });
});
