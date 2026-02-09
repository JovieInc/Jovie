/**
 * Unit tests for StaticArtistPage mode rendering.
 *
 * Tests the different rendering modes (profile, listen, tip, subscribe)
 * and the helper functions (mapSocialPlatformToDSPKey, extractVenmoUsername).
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist, LegacySocialLink } from '@/types/db';

// --- Mock all child components ---
vi.mock('@/components/profile/ArtistPageShell', () => ({
  ArtistPageShell: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'artist-page-shell' },
      children
    ),
}));

vi.mock('@/components/profile/artist-notifications-cta', () => ({
  ArtistNotificationsCTA: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'notifications-cta' }),
}));

vi.mock('@/components/profile/LatestReleaseCard', () => ({
  LatestReleaseCard: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'latest-release-card' }),
}));

vi.mock('@/components/profile/ProfilePrimaryCTA', () => ({
  ProfilePrimaryCTA: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'profile-primary-cta' }),
}));

vi.mock('@/components/profile/StaticListenInterface', () => ({
  StaticListenInterface: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'listen-interface' }),
}));

vi.mock('@/components/profile/VenmoTipSelector', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'venmo-tip-selector' }),
}));

vi.mock('@/lib/dsp', () => ({
  DSP_CONFIGS: {
    spotify: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: '#fff',
      logoSvg: '',
    },
    apple_music: {
      name: 'Apple Music',
      color: '#FA233B',
      textColor: '#fff',
      logoSvg: '',
    },
  },
  getAvailableDSPs: vi.fn(() => []),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'testartist',
  spotify_id: 'spotify-123',
  name: 'Test Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Test tagline',
  theme: {},
  settings: { hide_branding: false },
  spotify_url: 'https://open.spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: undefined,
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00Z',
};

const mockSocialLinks: LegacySocialLink[] = [
  {
    id: 'link-1',
    artist_id: 'artist-1',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/123',
    clicks: 10,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'link-2',
    artist_id: 'artist-1',
    platform: 'instagram',
    url: 'https://instagram.com/testartist',
    clicks: 5,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockVenmoLinks: LegacySocialLink[] = [
  ...mockSocialLinks,
  {
    id: 'link-3',
    artist_id: 'artist-1',
    platform: 'venmo',
    url: 'https://venmo.com/u/testartist',
    clicks: 0,
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('StaticArtistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders profile mode with primary CTA', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showTipButton={false}
        showBackButton={false}
      />
    );

    expect(screen.getByTestId('primary-cta')).toBeDefined();
    expect(screen.getByTestId('profile-primary-cta')).toBeDefined();
  });

  it('renders listen mode with listen interface', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='listen'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Choose a Service'
        showTipButton={false}
        showBackButton={true}
      />
    );

    expect(screen.getByTestId('listen-interface')).toBeDefined();
  });

  it('renders tip mode with venmo selector when venmo link exists', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='tip'
        artist={mockArtist}
        socialLinks={mockVenmoLinks}
        contacts={[]}
        subtitle='Tip with Venmo'
        showTipButton={true}
        showBackButton={true}
      />
    );

    expect(screen.getByTestId('venmo-tip-selector')).toBeDefined();
  });

  it('renders tip mode with unavailable message when no venmo link', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='tip'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Tip with Venmo'
        showTipButton={false}
        showBackButton={true}
      />
    );

    expect(screen.getByText(/Venmo tipping is not available/)).toBeDefined();
  });

  it('renders subscribe mode with notifications CTA', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='subscribe'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Get notified'
        showTipButton={false}
        showBackButton={true}
      />
    );

    expect(screen.getByTestId('notifications-cta')).toBeDefined();
  });

  it('renders latest release card when in profile mode with release', async () => {
    const mockRelease = {
      id: 'release-1',
      creatorProfileId: 'profile-123',
      title: 'Test Album',
      releaseType: 'album',
      artworkUrl: 'https://example.com/art.jpg',
      releaseDate: new Date('2024-06-01'),
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
      trackCount: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showTipButton={false}
        showBackButton={false}
        latestRelease={mockRelease as any}
      />
    );

    expect(screen.getByTestId('latest-release-card')).toBeDefined();
  });

  it('does not render latest release card when no release', async () => {
    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='profile'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Artist'
        showTipButton={false}
        showBackButton={false}
        latestRelease={null}
      />
    );

    expect(screen.queryByTestId('latest-release-card')).toBeNull();
  });

  it('does not render latest release in non-profile modes', async () => {
    const mockRelease = {
      id: 'release-1',
      title: 'Test Album',
      releaseType: 'album',
      artworkUrl: null,
      releaseDate: null,
    };

    const { StaticArtistPage } = await import(
      '@/components/profile/StaticArtistPage'
    );
    render(
      <StaticArtistPage
        mode='listen'
        artist={mockArtist}
        socialLinks={mockSocialLinks}
        contacts={[]}
        subtitle='Choose a Service'
        showTipButton={false}
        showBackButton={true}
        latestRelease={mockRelease as any}
      />
    );

    expect(screen.queryByTestId('latest-release-card')).toBeNull();
  });
});

describe('Platform DSP Mapping Logic', () => {
  // Test the mapping logic replicated from the component
  const PLATFORM_TO_DSP_MAPPINGS = [
    { keywords: ['spotify'], dspKey: 'spotify' },
    { keywords: ['applemusic', 'itunes'], dspKey: 'apple_music' },
    { keywords: ['youtube'], dspKey: 'youtube' },
    { keywords: ['soundcloud'], dspKey: 'soundcloud' },
    { keywords: ['bandcamp'], dspKey: 'bandcamp' },
    { keywords: ['tidal'], dspKey: 'tidal' },
    { keywords: ['deezer'], dspKey: 'deezer' },
    { keywords: ['amazonmusic'], dspKey: 'amazon_music' },
    { keywords: ['pandora'], dspKey: 'pandora' },
  ];

  function mapSocialPlatformToDSPKey(
    platform: string | undefined
  ): string | null {
    if (typeof platform !== 'string' || !platform) return null;
    const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    for (const { keywords, dspKey } of PLATFORM_TO_DSP_MAPPINGS) {
      if (
        keywords.some(
          keyword => normalized.includes(keyword) || normalized === keyword
        )
      ) {
        return dspKey;
      }
    }
    return null;
  }

  it.each([
    ['spotify', 'spotify'],
    ['Spotify', 'spotify'],
    ['SPOTIFY', 'spotify'],
    ['apple_music', 'apple_music'],
    ['AppleMusic', 'apple_music'],
    ['itunes', 'apple_music'],
    ['youtube', 'youtube'],
    ['YouTube', 'youtube'],
    ['soundcloud', 'soundcloud'],
    ['bandcamp', 'bandcamp'],
    ['tidal', 'tidal'],
    ['deezer', 'deezer'],
    ['amazon_music', 'amazon_music'],
    ['AmazonMusic', 'amazon_music'],
    ['pandora', 'pandora'],
  ])('maps "%s" to DSP key "%s"', (platform, expected) => {
    expect(mapSocialPlatformToDSPKey(platform)).toBe(expected);
  });

  it('returns null for non-DSP platforms', () => {
    expect(mapSocialPlatformToDSPKey('instagram')).toBeNull();
    expect(mapSocialPlatformToDSPKey('twitter')).toBeNull();
    expect(mapSocialPlatformToDSPKey('venmo')).toBeNull();
    expect(mapSocialPlatformToDSPKey('tiktok')).toBeNull();
  });

  it('returns null for undefined/empty input', () => {
    expect(mapSocialPlatformToDSPKey(undefined)).toBeNull();
    expect(mapSocialPlatformToDSPKey('')).toBeNull();
  });
});

describe('Venmo Username Extraction Logic', () => {
  const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

  function extractVenmoUsername(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (ALLOWED_VENMO_HOSTS.has(u.hostname)) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] === 'u' && parts[1]) return parts[1];
        if (parts[0]) return parts[0];
      }
      return null;
    } catch {
      return null;
    }
  }

  it('extracts username from /u/username format', () => {
    expect(extractVenmoUsername('https://venmo.com/u/testuser')).toBe(
      'testuser'
    );
  });

  it('extracts username from /username format', () => {
    expect(extractVenmoUsername('https://venmo.com/testuser')).toBe('testuser');
  });

  it('works with www.venmo.com', () => {
    expect(extractVenmoUsername('https://www.venmo.com/u/testuser')).toBe(
      'testuser'
    );
  });

  it('returns null for non-venmo hosts', () => {
    expect(extractVenmoUsername('https://evil.com/u/testuser')).toBeNull();
    expect(
      extractVenmoUsername('https://venmo.com.evil.com/u/testuser')
    ).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractVenmoUsername(null)).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(extractVenmoUsername('not-a-url')).toBeNull();
    expect(extractVenmoUsername('')).toBeNull();
  });

  it('returns null for venmo.com with no path', () => {
    expect(extractVenmoUsername('https://venmo.com/')).toBeNull();
  });
});
