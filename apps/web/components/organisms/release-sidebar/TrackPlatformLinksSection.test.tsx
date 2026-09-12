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
});
