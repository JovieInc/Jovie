import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

describe('TrackPlatformLinksSection', () => {
  it('turns missing DSPs into Find and keeps linked rows quiet', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);

    render(
      <TrackPlatformLinksSection
        providers={[
          {
            key: 'spotify' as ProviderKey,
            label: 'Spotify',
            url: 'https://open.spotify.com/track/example',
          },
        ]}
        missingProviders={[{ key: 'apple_music' as ProviderKey }]}
        findQuery='Take Me Over'
      />
    );

    expect(screen.getByRole('link', { name: /Spotify/ })).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/example'
    );
    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://music.apple.com/us/search?term=Take%20Me%20Over',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('derives the full destination treatment from the track when one is given', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <TrackPlatformLinksSection
        track={{
          id: 'track-1',
          title: 'Take Me Over',
          durationMs: 193_000,
          smartLinkPath: '/example/take-me-over',
        }}
        providers={[
          {
            key: 'spotify' as ProviderKey,
            label: 'Spotify',
            url: 'https://open.spotify.com/track/example',
          },
        ]}
      />
    );

    // The row carries the destination action menu with the UTM-tagged Jovie
    // link and the derived platform URI; no separate findQuery prop needed.
    await user.click(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );
    expect(screen.getAllByRole('menuitem').map(m => m.textContent?.trim()))
      .toEqual(['Open', 'Copy link', 'Copy Jovie link with UTM', 'Copy platform URI']);

    await user.click(screen.getByRole('menuitem', { name: 'Copy platform URI' }));
    expect(writeText).toHaveBeenCalledWith('spotify:track:example');

    await user.click(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Copy Jovie link with UTM' })
    );
    expect(writeText).toHaveBeenCalledWith(
      'https://jov.ie/example/take-me-over?utm_source=spotify&utm_medium=track-sidebar'
    );
  });
});
