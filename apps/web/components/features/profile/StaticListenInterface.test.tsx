import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LISTEN_COOKIE } from '@/constants/app';
import type { AvailableDSP } from '@/lib/dsp';
import { toGenericPlatformLink } from '@/lib/platform-links';
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
  it('keeps a generic platform link usable without identifying it as a DSP', async () => {
    const instagram = toGenericPlatformLink(
      'instagram',
      'https://www.instagram.com/timwhite'
    );
    expect(instagram).not.toBeNull();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    try {
      render(
        <StaticListenInterface
          artist={artist}
          handle='tim'
          dspsOverride={[...dsps, instagram!]}
        />
      );

      const genericLink = screen.getByRole('link', {
        name: 'Listen on Instagram',
      });
      expect(genericLink).toHaveAttribute('href', instagram!.url);
      expect(genericLink).toHaveAttribute('target', '_blank');
      expect(genericLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(genericLink).not.toHaveAttribute('data-dsp-provider');
      expect(
        screen.getByRole('link', { name: 'Listen on Spotify' })
      ).toHaveAttribute('data-dsp-provider', 'spotify');
      expect(
        screen.getByRole('link', { name: 'Listen on Apple Music' })
      ).toHaveAttribute('data-dsp-provider', 'apple_music');

      fireEvent.click(genericLink);
      await waitFor(() =>
        expect(open).toHaveBeenCalledWith(
          instagram!.url,
          '_blank',
          'noopener,noreferrer'
        )
      );
      expect(localStorage.getItem(LISTEN_COOKIE)).toBe(instagram!.key);
      expect(document.cookie).toContain(`${LISTEN_COOKIE}=${instagram!.key}`);
    } finally {
      open.mockRestore();
      localStorage.removeItem(LISTEN_COOKIE);
      document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0`;
    }
  });

  it('exposes DSP destinations as links in the accessibility tree', () => {
    render(
      <StaticListenInterface artist={artist} handle='tim' dspsOverride={dsps} />
    );

    const list = screen.getByRole('navigation', {
      name: 'Listen On Streaming Services',
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
