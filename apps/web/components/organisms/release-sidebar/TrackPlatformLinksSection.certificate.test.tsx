import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

const spotify = {
  key: 'spotify' as ProviderKey,
  label: 'Spotify',
  url: 'https://open.spotify.com/track/example',
};

describe('TrackPlatformLinksSection certificate', () => {
  it('links found DSPs and searches for missing ones, axe-clean', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    const { container } = render(
      <TrackPlatformLinksSection
        providers={[spotify]}
        missingProviders={[{ key: 'deezer' as ProviderKey }]}
        findQuery='Midnight Drive'
      />
    );

    expect(screen.getByRole('link', { name: /Spotify/ })).toHaveAttribute(
      'href',
      spotify.url
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('Midnight'),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('offers no Find action without a search query', async () => {
    const { container } = render(
      <TrackPlatformLinksSection
        providers={[]}
        missingProviders={[{ key: 'apple_music' as ProviderKey }]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Find' })).toBeNull();
    expect(screen.queryByTestId('track-platforms-empty')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the empty message with a custom title when nothing is known', async () => {
    const { container } = render(
      <TrackPlatformLinksSection
        providers={[]}
        title='Stores'
        emptyMessage='No store links yet.'
      />
    );

    expect(screen.getByTestId('track-platforms-empty')).toHaveTextContent(
      'No store links yet.'
    );
    expect(screen.getByText('Stores')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
