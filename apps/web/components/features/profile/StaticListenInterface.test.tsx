import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { StaticListenInterface } from './StaticListenInterface';

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/deep-links', () => ({
  getDSPDeepLinkConfig: () => null,
  openDeepLink: vi.fn(),
}));

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Tim White',
  handle: 'tim',
  spotify_id: '4u',
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
} satisfies Artist;

const dsps = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/4u',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    url: 'https://music.apple.com/artist/4u',
    config: {
      name: 'Apple Music',
      color: '#FA243C',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
] satisfies AvailableDSP[];

describe('StaticListenInterface', () => {
  it('exposes DSP destinations as links in the accessibility tree', () => {
    render(
      <StaticListenInterface artist={artist} handle='tim' dspsOverride={dsps} />
    );

    const list = screen.getByRole('navigation', {
      name: 'Listen on streaming services',
    });
    expect(list).toHaveAttribute('data-testid', 'profile-listen-dsp-links');

    const spotify = screen.getByRole('link', { name: 'Listen on Spotify' });
    expect(spotify).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/4u'
    );
    expect(spotify).toHaveAttribute('data-dsp-provider', 'spotify');

    const appleMusic = screen.getByRole('link', {
      name: 'Listen on Apple Music',
    });
    expect(appleMusic).toHaveAttribute(
      'href',
      'https://music.apple.com/artist/4u'
    );
    expect(appleMusic).toHaveAttribute('data-dsp-provider', 'apple_music');

    expect(
      screen.queryByRole('button', { name: /spotify|apple music/i })
    ).not.toBeInTheDocument();
  });

  it('keeps preview DSP rows out of the link tree', () => {
    render(
      <StaticListenInterface
        artist={artist}
        handle='tim'
        dspsOverride={dsps}
        renderMode='preview'
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Listen on Spotify' })
    ).toBeVisible();
  });
});
