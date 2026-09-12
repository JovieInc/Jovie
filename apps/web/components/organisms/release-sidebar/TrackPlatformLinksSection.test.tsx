import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

describe('TrackPlatformLinksSection', () => {
  it('renders linked DSPs as quiet rows without Not found copy', () => {
    render(
      <TrackPlatformLinksSection
        providers={[
          {
            key: 'spotify' as ProviderKey,
            label: 'Spotify',
            url: 'https://open.spotify.com/track/example',
          },
        ]}
      />
    );

    const row = screen.getByRole('link', { name: /Spotify/ });
    expect(row).toHaveAttribute(
      'href',
      'https://open.spotify.com/track/example'
    );
    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();
  });

  it('turns missing DSPs into Find buttons that open the provider search', async () => {
    const user = userEvent.setup();
    const openSpy = vi
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);

    render(
      <TrackPlatformLinksSection
        providers={[]}
        missingProviders={[{ key: 'apple_music' as ProviderKey }]}
        findQuery='Take Me Over'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://music.apple.com/us/search?term=Take%20Me%20Over',
      '_blank',
      'noopener,noreferrer'
    );
    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();

    openSpy.mockRestore();
  });
});
