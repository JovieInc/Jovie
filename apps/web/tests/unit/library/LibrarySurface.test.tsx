import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LibrarySurface } from '@/app/app/(shell)/dashboard/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/dashboard/library/library-data';
import { APP_ROUTES } from '@/constants/routes';

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & { readonly unoptimized?: boolean }
  ) => {
    const { unoptimized: _unoptimized, ...imgProps } = props;
    return <img alt='' {...imgProps} />;
  },
}));

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    trackCount: 1,
    providerCount: 1,
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: 'https://open.spotify.com/album/take-me-over',
      },
    ],
    hasLyrics: true,
    ...overrides,
  };
}

describe('LibrarySurface', () => {
  it('renders an empty read-only library state with a releases escape hatch', () => {
    render(<LibrarySurface assets={[]} />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeDefined();
    expect(
      screen.getByText(
        'Releases and artwork will appear here after your catalog is connected.'
      )
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open Releases' })).toHaveAttribute(
      'href',
      APP_ROUTES.DASHBOARD_RELEASES
    );
  });

  it('renders release assets with read-only release and provider links', () => {
    render(<LibrarySurface assets={[buildAsset()]} />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Take Me Over' })).toBeDefined();
    expect(screen.getByText('Tim White')).toBeDefined();
    expect(screen.getByText('Apr 28, 2026')).toBeDefined();
    expect(screen.getByText('Lyrics')).toBeDefined();

    expect(screen.getByRole('link', { name: /Open Release/u })).toHaveAttribute(
      'href',
      '/tim/take-me-over'
    );
    expect(screen.getByRole('link', { name: /Spotify/u })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/take-me-over'
    );
  });
});
