/**
 * Unit tests for the per-artist /{username}/llms.txt route (JovieInc/Jovie#11029).
 *
 * Verifies that the route produces correct machine-readable entity data for
 * AI assistants and handles edge cases (missing profile, reserved usernames).
 */

import { describe, expect, it, vi } from 'vitest';

// Hoist mocks so they are available when the module is imported
const mockGetProfileAndLinks = vi.hoisted(() => vi.fn());

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: mockGetProfileAndLinks,
}));

vi.mock('@/lib/validation/username-core', () => ({
  isReservedUsername: (u: string) => ['admin', 'api', 'app'].includes(u),
  USERNAME_MIN_LENGTH: 2,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-z0-9_-]+$/i,
}));

vi.mock('@/constants/app', () => ({
  BASE_URL: 'https://jov.ie',
}));

const { GET } = await import('@/app/[username]/llms.txt/route');

const baseProfile = {
  id: 'profile-1',
  username: 'djtest',
  username_normalized: 'djtest',
  display_name: 'DJ Test',
  bio: 'Late-night club records.',
  location: 'Los Angeles, CA',
  is_verified: true,
  is_public: true,
  active_since_year: 2018,
  spotify_url: 'https://open.spotify.com/artist/test',
  apple_music_url: 'https://music.apple.com/artist/test',
  youtube_url: null,
};

const baseLinks = [
  {
    id: 'link-1',
    artist_id: 'profile-1',
    platform: 'instagram',
    url: 'https://instagram.com/djtest',
    clicks: 0,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const baseLatestRelease = {
  id: 'release-1',
  title: 'Midnight Drive',
  slug: 'midnight-drive',
  releaseType: 'single',
  releaseDate: '2026-01-15',
};

function makeParams(username: string) {
  return { params: Promise.resolve({ username }) };
}

describe('GET /{username}/llms.txt', () => {
  it('returns 404 for a reserved username', async () => {
    const res = await GET(
      new Request('https://jov.ie/admin/llms.txt'),
      makeParams('admin')
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when profile is not found', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: null,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/unknown/llms.txt'),
      makeParams('unknown')
    );
    expect(res.status).toBe(404);
  });

  it('returns text/plain content type', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: baseLinks,
      genres: ['tech house', 'club'],
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('includes the canonical profile URL as the entity anchor', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('https://jov.ie/djtest');
    expect(body).toContain('@djtest');
  });

  it('includes artist name as the heading', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('# DJ Test');
  });

  it('includes DSP streaming links from profile columns', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('https://open.spotify.com/artist/test');
    expect(body).toContain('https://music.apple.com/artist/test');
  });

  it('includes social links from the links table', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: baseLinks,
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('https://instagram.com/djtest');
  });

  it('includes latest release title and slug link', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: baseLatestRelease,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('Midnight Drive');
    expect(body).toContain('https://jov.ie/djtest/midnight-drive');
  });

  it('includes genres when provided', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: ['tech house', 'club'],
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('tech house');
    expect(body).toContain('club');
  });

  it('includes AI assistant guidance section with canonical URL', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('For AI Assistants');
    expect(body).toContain('https://jov.ie/djtest');
  });

  it('omits DSP section when profile has no streaming links', async () => {
    const profileNoStreaming = {
      ...baseProfile,
      spotify_url: null,
      apple_music_url: null,
      youtube_url: null,
    };
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: profileNoStreaming,
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).not.toContain('## Stream');
  });
});
