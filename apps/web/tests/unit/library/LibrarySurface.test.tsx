import { TooltipProvider } from '@jovie/ui';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurface';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  ShellSidebarOverrideProvider,
  useShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';

Element.prototype.scrollIntoView = vi.fn();

const navigationMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const blobUploadMock = vi.hoisted(() => vi.fn());

const audioMock = vi.hoisted(() => {
  const basePlaybackState = {
    activeTrackId: null,
    isPlaying: false,
    playbackStatus: 'idle',
    lastErrorReason: null,
    currentTime: 0,
    duration: 0,
    trackTitle: null,
    releaseTitle: null,
    artistName: null,
    artworkUrl: null,
    hasLyrics: false,
  };

  return {
    basePlaybackState,
    playbackState: { ...basePlaybackState },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  };
});

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => audioMock,
}));

vi.mock('@vercel/blob/client', () => ({
  upload: blobUploadMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: navigationMock.refresh,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

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

function SidebarOverrideProbe() {
  const override = useShellSidebarOverride();

  return (
    <output
      aria-label='Sidebar override contract'
      data-testid='library-sidebar-override'
      data-back-href={override?.backHref}
      data-back-label={override?.backLabel}
      data-key={override?.key}
    >
      {override?.content ? 'registered' : 'missing'}
    </output>
  );
}

function renderLibraryWithSidebarOverride(
  assets: readonly LibraryReleaseAsset[]
) {
  return render(
    <TooltipProvider>
      <ShellSidebarOverrideProvider>
        <LibrarySurface assets={assets} />
        <SidebarOverrideProbe />
      </ShellSidebarOverrideProvider>
    </TooltipProvider>
  );
}

describe('LibrarySurface', () => {
  const baseMatchMedia = window.matchMedia;

  beforeEach(() => {
    audioMock.playbackState = { ...audioMock.basePlaybackState };
    audioMock.toggleTrack.mockClear();
    audioMock.seek.mockClear();
    audioMock.stop.mockClear();
    audioMock.onError.mockClear();
    navigationMock.refresh.mockClear();
    blobUploadMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.matchMedia = baseMatchMedia;
  });

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
      APP_ROUTES.RELEASES
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

    fireEvent.click(
      screen.getByRole('button', { name: /Inspect Take Me Over/u })
    );

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
    const drawer = within(screen.getByTestId('library-asset-drawer'));
    expect(
      drawer.getAllByRole('button', {
        name: /Play Preview for Take Me Over/u,
      }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('68/100')).toBeDefined();
    expect(screen.getByText('Progressive House')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('uses shell focus tokens for library cards and drawer actions', () => {
    renderLibrary([buildAsset()]);

    const assetCardButton = screen.getByRole('button', {
      name: /Inspect Take Me Over/u,
    });

    expect(assetCardButton.className).toContain(
      'focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
    );
    expect(assetCardButton.className).toContain(
      'focus-visible:ring-offset-(--linear-app-content-surface)'
    );
    expect(assetCardButton.className).not.toContain('focus-visible:shadow');

    fireEvent.click(assetCardButton);

    const closeButton = screen.getByRole('button', {
      name: 'Close asset details',
    });
    const openReleaseLink = screen.getByRole('link', {
      name: /Open Release/u,
    });
    const [previewButton] = within(
      screen.getByTestId('library-asset-drawer')
    ).getAllByRole('button', { name: /Play Preview for Take Me Over/u });
    if (!previewButton) {
      throw new Error('Expected a drawer preview button');
    }
    const providerLink = screen.getByRole('link', { name: /Spotify/u });

    for (const element of [
      closeButton,
      openReleaseLink,
      previewButton,
      providerLink,
    ]) {
      expect(element.className).toContain(
        'focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
      );
      expect(element.className).toContain(
        'focus-visible:ring-offset-(--linear-app-content-surface)'
      );
      expect(element.className).not.toContain('focus-visible:shadow');
    }
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

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
  });

  it('starts the persistent player from real production preview data', () => {
    renderLibrary([buildAsset()]);

    fireEvent.click(screen.getByTestId('library-preview-card-release-1'));

    expect(audioMock.toggleTrack).toHaveBeenCalledWith({
      id: 'release-1',
      title: 'Take Me Over',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      releaseTitle: 'Take Me Over',
      artistName: 'Tim White',
      artworkUrl: 'https://cdn.example.com/artwork.jpg',
      hasLyrics: true,
    });
  });

  it('renders a right-rail audio dropzone when a release is missing audio', () => {
    renderLibrary([
      buildAsset({
        previewUrl: null,
        assetKinds: ['artwork', 'lyrics', 'providers'],
      }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: /Inspect Take Me Over/u })
    );

    expect(screen.getByTestId('library-audio-dropzone')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload audio for Take Me Over')
    ).toHaveAttribute('accept', expect.stringContaining('audio/mpeg'));
    expect(screen.queryByTestId('library-audio-ready')).not.toBeInTheDocument();
  });

  it('uploads missing drawer audio and reveals persistent-player controls', async () => {
    const previewUrl = 'https://cdn.example.com/uploaded-preview.mp3';
    blobUploadMock.mockResolvedValue({
      url: previewUrl,
      pathname: 'library/audio/uploaded-preview.mp3',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, previewUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    renderLibrary([
      buildAsset({
        previewUrl: null,
        assetKinds: ['artwork', 'lyrics', 'providers'],
      }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: /Inspect Take Me Over/u })
    );
    fireEvent.change(screen.getByLabelText('Upload audio for Take Me Over'), {
      target: {
        files: [
          new File(['audio'], 'take-me-over.mp3', { type: 'audio/mpeg' }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('library-audio-ready')).toBeInTheDocument();
    });
    expect(blobUploadMock).toHaveBeenCalledWith(
      'take-me-over.mp3',
      expect.any(File),
      {
        access: 'public',
        handleUploadUrl: '/api/library/audio/upload-token',
      }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/library/audio/confirm',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(navigationMock.refresh).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByTestId('library-asset-drawer')).getAllByRole(
        'button',
        { name: /Play Preview for Take Me Over/u }
      ).length
    ).toBeGreaterThan(0);
  });

  it('opens the read-only asset drawer from list rows', () => {
    renderLibrary([buildAsset()]);

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const row = screen.getByTestId('library-release-row-release-1');

    fireEvent.click(row);

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row.className).toContain('bg-(--linear-row-selected)');
    expect(row.className).not.toContain('shadow-[inset_3px_0_0_0');
    expect(screen.getByRole('link', { name: /Open Release/u })).toHaveAttribute(
      'href',
      '/tim/take-me-over'
    );
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

    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
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

  it('keeps Library inside the standard app shell without a route sidebar takeover', async () => {
    renderLibraryWithSidebarOverride([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    const contract = await screen.findByTestId('library-sidebar-override');

    await waitFor(() => {
      expect(contract).toHaveTextContent('registered');
    });
    expect(contract).toHaveAttribute('data-key', 'library');
    expect(contract).toHaveAttribute('data-back-href', APP_ROUTES.CHAT);
    expect(contract).toHaveAttribute('data-back-label', 'Back to App');
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(
      screen.getByRole('navigation', { name: 'Library navigation' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /All Releases/u })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Needs Assets/u })
    ).toBeInTheDocument();
  });

  it('keeps library filters reachable on desktop without taking over the shell sidebar', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderLibraryWithSidebarOverride([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    const contract = await screen.findByTestId('library-sidebar-override');

    await waitFor(() => {
      expect(contract).toHaveTextContent('registered');
    });
    expect(contract).toHaveAttribute('data-key', 'library');
    expect(contract).toHaveAttribute('data-back-href', APP_ROUTES.CHAT);
    expect(contract).toHaveAttribute('data-back-label', 'Back to App');
  });
});
