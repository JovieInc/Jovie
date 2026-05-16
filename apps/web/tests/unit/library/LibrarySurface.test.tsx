import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurface';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';

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
    previewUrl: 'https://cdn.example.com/preview.mp3',
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
    hasArtwork: true,
    hasVideoLinks: false,
    assetKinds: ['artwork', 'preview', 'lyrics', 'providers'],
    genres: ['Progressive House'],
    spotifyPopularity: 68,
    targetPlaylistCount: 2,
    isExplicit: false,
    label: 'Jovie',
    upc: '123456789012',
    distributor: 'Jovie',
    totalDurationMs: 212_000,
    ...overrides,
  };
}

function renderLibraryWithHeader(assets: readonly LibraryReleaseAsset[]) {
  return render(
    <TooltipProvider>
      <HeaderActionsProvider>
        <HeaderSearchSurfaceFromContext />
        <LibrarySurface assets={assets} />
      </HeaderActionsProvider>
    </TooltipProvider>
  );
}

function renderLibrary(assets: readonly LibraryReleaseAsset[]) {
  return render(
    <TooltipProvider>
      <LibrarySurface assets={assets} />
    </TooltipProvider>
  );
}

describe('LibrarySurface', () => {
  it('renders an empty read-only library state with a releases escape hatch', () => {
    renderLibrary([]);

    expect(screen.getByText('No Release Assets')).toBeDefined();
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

  it('renders release assets with grid cards and a read-only detail drawer', () => {
    renderLibrary([buildAsset()]);

    expect(screen.getByTestId('library-surface')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Take Me Over' })).toBeDefined();
    expect(screen.getByText('Tim White')).toBeDefined();
    expect(screen.getAllByText('Artwork').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lyrics').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Take Me Over/u }));

    expect(screen.getByText('Apr 28, 2026')).toBeDefined();
    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(screen.getByRole('link', { name: /Open Release/u })).toHaveAttribute(
      'href',
      '/tim/take-me-over'
    );
    expect(screen.getByRole('link', { name: /Spotify/u })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/take-me-over'
    );
    expect(screen.getByRole('link', { name: /^Preview$/u })).toHaveAttribute(
      'href',
      'https://cdn.example.com/preview.mp3'
    );
    expect(screen.getByText('68/100')).toBeDefined();
    expect(screen.getByText('Progressive House')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('switches between grid and list modes without losing the release list', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
        providers: [
          {
            key: 'apple',
            label: 'Apple Music',
            url: 'https://music.apple.com/album/never-say-a-word',
          },
        ],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
  });

  it('filters release assets from the shell header search contract', () => {
    renderLibraryWithHeader([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
        providers: [
          {
            key: 'apple',
            label: 'Apple Music',
            url: 'https://music.apple.com/album/never-say-a-word',
          },
        ],
      }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Filter library assets' })
    );
    fireEvent.change(screen.getByLabelText('Filter library assets'), {
      target: { value: 'Never' },
    });
    fireEvent.mouseDown(
      screen.getByRole('option', { name: /Never Say A Word/u })
    );

    expect(
      screen.getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Take Me Over' })
    ).not.toBeInTheDocument();
  });

  it('filters release assets from the Library navigation', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
        artworkUrl: null,
        previewUrl: null,
        providerCount: 0,
        providers: [],
        hasArtwork: false,
        hasLyrics: false,
        assetKinds: [],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: /Needs Assets/u }));

    expect(
      screen.getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Take Me Over' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All Releases/u }));

    expect(
      screen.getByRole('heading', { name: 'Take Me Over' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
  });
});
