import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
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

  it('keeps legitimate public artist feeds discoverable', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
    });
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/realartist/feed.xml'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
    expect(await res.text()).toContain('Real Artist — Releases');
  });
});
