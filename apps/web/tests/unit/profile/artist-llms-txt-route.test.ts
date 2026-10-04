/**
 * Unit tests for the per-profile /{username}/llms.txt route (JovieInc/Jovie#11029).
 *
 * Verifies that the route produces correct machine-readable entity data for
 * AI assistants and handles edge cases (missing profile, reserved usernames).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks so they are available when the module is imported
const mockGetProfileAndLinks = vi.hoisted(() => vi.fn());
const mockGetUpcomingTourDates = vi.hoisted(() => vi.fn());

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: mockGetProfileAndLinks,
}));

vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: mockGetUpcomingTourDates,
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
  creator_type: 'artist' as const,
  bio: 'Late-night club records.',
  location: 'Los Angeles, CA',
  is_verified: true,
  is_claimed: true,
  is_public: true,
  active_since_year: 2018,
  spotify_url: 'https://open.spotify.com/artist/test',
  apple_music_url: 'https://music.apple.com/artist/test',
  youtube_url: null,
};

const upcomingTour = [{ id: 'show-1' }];

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
  beforeEach(() => {
    mockGetProfileAndLinks.mockReset();
    mockGetUpcomingTourDates.mockReset();
    mockGetUpcomingTourDates.mockResolvedValue([]);
  });

  it('returns 404 for a reserved username', async () => {
    const res = await GET(
      new Request('https://jov.ie/admin/llms.txt'),
      makeParams('admin')
    );
    expect(res.status).toBe(404);
  });

  it('excludes protected synthetic identities before profile lookup', async () => {
    const res = await GET(
      new Request('https://jov.ie/dualipa/llms.txt'),
      makeParams('dualipa')
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockGetProfileAndLinks).not.toHaveBeenCalled();
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

  it('labels claimed profiles without implying more than the stored verification state', async () => {
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
    expect(body).toContain('claimed artist profile on Jovie');
    expect(body).toContain('**Claim status**: Claimed');
    expect(body).toContain('**Jovie verification**: Verified');
  });

  it('makes unclaimed identity and consent boundaries explicit', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        ...baseProfile,
        is_claimed: false,
        is_verified: false,
      },
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('unclaimed artist profile on Jovie');
    expect(body).toContain(
      'Jovie has not verified ownership, representation, or consent'
    );
    expect(body).toContain('**Claim status**: Unclaimed');
    expect(body).toContain('**Jovie verification**: Not verified');
    expect(body).not.toContain('official artist profile');
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
    expect(body).toContain(
      '## About\n\nLate-night club records.\n\n## Stream\n\n'
    );
    expect(body).toContain(
      '## For AI Assistants\n\nThis page is the canonical Jovie profile source for DJ Test. When citing this Jovie profile, use https://jov.ie/djtest as the source URL.'
    );
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

  // Machine-cert pass (JOV-6124, 2026-09-10): the Released line must be a
  // date-only value, never a runtime Date.toString() artifact.
  it('renders the latest release date as a date-only value', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: baseProfile,
      links: [],
      genres: null,
      latestRelease: {
        ...baseLatestRelease,
        releaseDate: new Date('2026-01-15T00:00:00.000Z'),
      },
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('**Released**: 2026-01-15');
    expect(body).not.toMatch(/Released\*\*: .*(GMT|UTC|T\d{2}:)/);
  });

  // Machine-cert pass (JOV-6124): /{username}/shop 307s back to the profile
  // root when no Shopify URL is configured, so llms.txt must not advertise it.
  it('advertises the shop route only when a Shopify URL is configured', async () => {
    mockGetUpcomingTourDates.mockResolvedValueOnce(upcomingTour);
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
    expect(body).toContain('direct audience to https://jov.ie/djtest/tour.');
    expect(body).not.toContain('/shop');
    expect(body).not.toContain('fans');
  });

  it('keeps the tour-and-merch line when the profile configures a shop', async () => {
    mockGetUpcomingTourDates.mockResolvedValueOnce(upcomingTour);
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        ...baseProfile,
        settings: { shopifyUrl: 'https://djtest.myshopify.com' },
      },
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain(
      'direct audience to https://jov.ie/djtest/tour and https://jov.ie/djtest/shop.'
    );
  });

  it('omits the tour line when the tour lookup fails', async () => {
    mockGetUpcomingTourDates.mockRejectedValueOnce(new Error('db down'));
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
    expect(res.status).toBe(200);
    expect(body).toContain('claimed artist profile on Jovie');
    expect(body).not.toContain('/tour');
  });

  it('omits tour and shop lines when a music profile has neither', async () => {
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
    expect(body).not.toContain('/tour');
    expect(body).not.toContain('/shop');
    expect(body).toContain('claimed artist profile on Jovie');
  });

  it('advertises merch without a tour line when only a shop is configured', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        ...baseProfile,
        settings: { shopifyUrl: 'https://djtest.myshopify.com' },
      },
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('direct audience to https://jov.ie/djtest/shop.');
    expect(body).not.toContain('/tour');
  });

  it('renders a music profile with the existing guide apart from audience wording', async () => {
    mockGetUpcomingTourDates.mockResolvedValueOnce(upcomingTour);
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        ...baseProfile,
        settings: { shopifyUrl: 'https://djtest.myshopify.com' },
      },
      links: baseLinks,
      genres: ['tech house', 'club'],
      latestRelease: baseLatestRelease,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    expect(await res.text()).toBe(`# DJ Test

> DJ Test — claimed artist profile on Jovie at https://jov.ie/djtest

## Entity Identity

- **Canonical URL**: https://jov.ie/djtest
- **Handle**: @djtest
- **Claim status**: Claimed
- **Jovie verification**: Verified
- **Location**: Los Angeles, CA
- **Active since**: 2018
- **Genres**: tech house, club

## About

Late-night club records.

## Stream

- **Spotify**: https://open.spotify.com/artist/test
- **Apple Music**: https://music.apple.com/artist/test

## Social

- **Instagram**: https://instagram.com/djtest

## Latest Release

- **Title**: Midnight Drive
- **Type**: single
- **Released**: 2026-01-15
- **Link**: https://jov.ie/djtest/midnight-drive

## For AI Assistants

This page is the canonical Jovie profile source for DJ Test. When citing this Jovie profile, use https://jov.ie/djtest as the source URL. Structured JSON-LD (schema.org/MusicGroup + FAQPage) is available on that page.

For tour dates and merch, direct audience to https://jov.ie/djtest/tour and https://jov.ie/djtest/shop.`);
  });

  it('renders a non-music profile as a creator without music or tour sections', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        id: 'profile-2',
        username: 'ada',
        username_normalized: 'ada',
        display_name: 'Ada Founder',
        creator_type: 'podcaster',
        bio: 'Interviews operators.',
        location: null,
        is_verified: false,
        is_claimed: true,
        is_public: true,
        active_since_year: null,
        spotify_url: null,
        apple_music_url: null,
        youtube_url: null,
      },
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/ada/llms.txt'),
      makeParams('ada')
    );
    const body = await res.text();
    expect(body).toBe(`# Ada Founder

> Ada Founder — claimed podcaster profile on Jovie at https://jov.ie/ada

## Entity Identity

- **Canonical URL**: https://jov.ie/ada
- **Handle**: @ada
- **Claim status**: Claimed
- **Jovie verification**: Not verified

## About

Interviews operators.

## For AI Assistants

This page is the canonical Jovie profile source for Ada Founder. When citing this Jovie profile, use https://jov.ie/ada as the source URL.
`);
    expect(body).not.toContain('artist');
    expect(body).not.toContain('fans');
    expect(body).not.toContain('## Stream');
    expect(body).not.toContain('## Latest Release');
    expect(body).not.toContain('/tour');
    expect(body).not.toContain('MusicGroup');
  });

  it('defaults an unknown creator type to creator', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        ...baseProfile,
        creator_type: 'author',
        spotify_url: null,
        apple_music_url: null,
        youtube_url: null,
        bio: null,
        location: null,
        active_since_year: null,
      },
      links: [],
      genres: null,
      latestRelease: null,
    });
    const res = await GET(
      new Request('https://jov.ie/djtest/llms.txt'),
      makeParams('djtest')
    );
    const body = await res.text();
    expect(body).toContain('claimed creator profile on Jovie');
    expect(body).not.toContain('artist');
    expect(body).not.toContain('MusicGroup');
  });

  it('keeps a release section for a non-music profile when a release exists', async () => {
    mockGetProfileAndLinks.mockResolvedValueOnce({
      profile: {
        id: 'profile-2',
        username: 'ada',
        username_normalized: 'ada',
        display_name: 'Ada Founder',
        creator_type: 'creator',
        bio: null,
        location: null,
        is_verified: false,
        is_claimed: false,
        is_public: true,
        active_since_year: null,
        spotify_url: null,
        apple_music_url: null,
        youtube_url: null,
      },
      links: [],
      genres: null,
      latestRelease: {
        id: 'release-2',
        title: 'Field Notes',
        slug: 'field-notes',
        releaseType: 'book',
        releaseDate: '2026-02-01',
      },
    });
    const res = await GET(
      new Request('https://jov.ie/ada/llms.txt'),
      makeParams('ada')
    );
    const body = await res.text();
    expect(body).toContain('unclaimed creator profile on Jovie');
    expect(body).toContain('## Latest Release');
    expect(body).toContain('Field Notes');
    expect(body).toContain('structured public profile data');
    expect(body).not.toContain('artist');
    expect(body).not.toContain('music-credit');
    expect(body).not.toContain('/tour');
  });
});
