import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LIBRARY_SAVED_VIEW_STORAGE_KEY } from '@/app/app/(shell)/library/library-saved-views';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  ShellSidebarOverrideProvider,
  useShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';

Element.prototype.scrollIntoView = vi.fn();

const LIBRARY_SURFACE_SOURCE = 'app/app/(shell)/library/LibrarySurface.tsx';
const legacyGeistAccentPattern = new RegExp(
  ['--', 'ge', 'ist-(?:cyan|blue)-solid'].join(''),
  'u'
);
const legacySelectionAccentPatterns = [
  legacyGeistAccentPattern,
  new RegExp(['border-', 'cy', 'an-400/50'].join(''), 'u'),
  new RegExp(['bg-', 'cy', 'an-400/\\[0\\.08\\]!'].join(''), 'u'),
  new RegExp(['rgb\\(103', '_232_249'].join(''), 'u'),
  new RegExp(['color-mix\\(in_oklab,var\\(--', 'ge', 'ist-'].join(''), 'u'),
  new RegExp(['bg-', 'white/35'].join(''), 'u'),
  new RegExp(['bg-', 'muted'].join(''), 'u'),
] as const;
const librarySurfaceLocalVisualRecipePatterns = [
  /\btext-(?:2xs|xs|sm|app|base|lg|xl)\b/u,
  /\btext-\[/u,
  /\brounded-(?:md|lg)\b/u,
  /\bshadow-\[/u,
  /\bbg-black(?:\/|\b)/u,
  /\bborder-white\//u,
  /\btext-white\b/u,
  /\bmin-h-\[118px\]/u,
  /\bbg-\[color-mix/u,
] as const;

const navigationMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const blobUploadMock = vi.hoisted(() => vi.fn());
const libraryMutationMocks = vi.hoisted(() => ({
  archiveMerch: vi.fn().mockResolvedValue({ success: true }),
  archiveRelease: vi.fn().mockResolvedValue({ success: true }),
  restoreMerch: vi.fn().mockResolvedValue({ success: true }),
  restoreRelease: vi.fn().mockResolvedValue({ success: true }),
  updateProfileVisibility: vi.fn().mockResolvedValue('hidden'),
}));

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

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  archiveLibraryRelease: libraryMutationMocks.archiveRelease,
  restoreRelease: libraryMutationMocks.restoreRelease,
}));

vi.mock('@/app/app/(shell)/library/actions', () => ({
  archiveLibraryMerchCard: libraryMutationMocks.archiveMerch,
  restoreLibraryMerchCard: libraryMutationMocks.restoreMerch,
}));

vi.mock('@/lib/library/profile-visibility/client-mutations', () => ({
  updateLibraryProfileVisibility: libraryMutationMocks.updateProfileVisibility,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: navigationMock.replace,
    refresh: navigationMock.refresh,
  }),
  useSearchParams: () => navigationMock.searchParams,
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
    videoUrl: null,
    waveformSeed: 17,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    approvalStatus: 'draft',
    profileVisibility: 'visible',
    lifecycleStatus: 'active',
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

function RightPanelOutlet() {
  return useRightPanel();
}

function renderLibraryWithHeader(assets: readonly LibraryReleaseAsset[]) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <HeaderActionsProvider>
          <HeaderSearchSurfaceFromContext />
          <LibrarySurface assets={assets} />
          <RightPanelOutlet />
        </HeaderActionsProvider>
      </RightPanelProvider>
    </TooltipProvider>
  );
}

function renderLibrary(assets: readonly LibraryReleaseAsset[]) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <LibrarySurface assets={assets} />
        <RightPanelOutlet />
      </RightPanelProvider>
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

function renderLibraryWithSidebarProbe(assets: readonly LibraryReleaseAsset[]) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <ShellSidebarOverrideProvider>
          <LibrarySurface assets={assets} />
          <SidebarOverrideProbe />
          <RightPanelOutlet />
        </ShellSidebarOverrideProvider>
      </RightPanelProvider>
    </TooltipProvider>
  );
}

function clickGridView() {
  fireEvent.click(screen.getByRole('button', { name: 'Grid View' }));
}

describe('LibrarySurface', () => {
  const baseMatchMedia = window.matchMedia;
  const baseScrollYDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'scrollY'
  );

  beforeEach(() => {
    window.localStorage.clear();
    navigationMock.searchParams = new URLSearchParams();
    audioMock.playbackState = { ...audioMock.basePlaybackState };
    audioMock.toggleTrack.mockClear();
    audioMock.seek.mockClear();
    audioMock.stop.mockClear();
    audioMock.onError.mockClear();
    navigationMock.refresh.mockClear();
    navigationMock.replace.mockClear();
    blobUploadMock.mockReset();
    libraryMutationMocks.archiveMerch.mockReset();
    libraryMutationMocks.archiveMerch.mockResolvedValue({ success: true });
    libraryMutationMocks.archiveRelease.mockReset();
    libraryMutationMocks.archiveRelease.mockResolvedValue({ success: true });
    libraryMutationMocks.restoreRelease.mockReset();
    libraryMutationMocks.restoreRelease.mockResolvedValue({ success: true });
    libraryMutationMocks.restoreMerch.mockReset();
    libraryMutationMocks.restoreMerch.mockResolvedValue({ success: true });
    libraryMutationMocks.updateProfileVisibility.mockReset();
    libraryMutationMocks.updateProfileVisibility.mockResolvedValue('hidden');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.matchMedia = baseMatchMedia;
    if (baseScrollYDescriptor) {
      Object.defineProperty(globalThis, 'scrollY', baseScrollYDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'scrollY');
    }
  });

  it('keeps library chrome on System B semantic tokens', () => {
    const source = readFileSync(
      resolve(process.cwd(), LIBRARY_SURFACE_SOURCE),
      'utf8'
    );

    for (const legacyPattern of legacySelectionAccentPatterns) {
      expect(source).not.toMatch(legacyPattern);
    }
    for (const localRecipePattern of librarySurfaceLocalVisualRecipePatterns) {
      expect(source).not.toMatch(localRecipePattern);
    }

    // Release/approval badge accents live in their semantic helpers
    // (lib/library/{release,approval}-status.ts) — guarded for distinctness
    // in library-system-b-compliance.test.ts and approval-status.test.ts.
    expect(source).toContain('releaseStatusClasses');
    expect(source).toContain('libraryApprovalStatusClasses');
    expect(source).toContain('PageToolbarTabButton');
    expect(source).toContain("variant={active ? 'secondary' : 'tertiary'}");
    expect(source).toContain('system-b-library-card--selected');
    expect(source).toContain('system-b-library-table-row-selected');
    expect(source).toContain('ReleaseAudioAssetPanel');
    expect(source).toContain('function LibraryFilterPanel');
    expect(source).toContain("data-testid='library-filter-active-indicator'");
    expect(source).toContain("surfaceMode='table'");
    expect(source).toContain('useRegisterRightPanel(assetDrawerPanel)');
    expect(source).not.toContain('libraryGridTemplateColumns');
    expect(source).not.toContain('Search library by title');
    expect(source).not.toContain('useRegisterShellSidebarOverride');
    expect(source).not.toContain('max-h-[45svh]');
  });

  it('keeps every visible Library status pill on one line', () => {
    const source = readFileSync(
      resolve(process.cwd(), LIBRARY_SURFACE_SOURCE),
      'utf8'
    );

    const statusPillClasses = source.match(
      /system-b-library-status-pill inline-flex[^']*/gu
    );

    expect(statusPillClasses).toHaveLength(4);
    for (const className of statusPillClasses ?? []) {
      expect(className).toContain('truncate');
      expect(className).toContain('rounded-full');
    }
  });

  it('keeps the table on one workspace plane while preserving grid insets', () => {
    const source = readFileSync(
      resolve(process.cwd(), LIBRARY_SURFACE_SOURCE),
      'utf8'
    );

    expect(source).toContain('LIBRARY_CONTENT_INSET_CLASS');
    expect(source).toContain(
      'px-(--linear-app-header-padding-x) py-(--linear-app-content-padding-y)'
    );
    expect(source).toContain('LIBRARY_GRID_DENSITY_LAYOUT');
    expect(source).toContain('useLibraryGridDensity');
    expect(source).toContain("containerClassName='h-full'");
    expect(source).toContain('h-(--app-shell-footer-row-height)');
    expect(source).not.toContain('px-2.5 pb-2.5 pt-1');
    expect(source).not.toMatch(/grid gap-2\.5/u);
  });

  it('defers persisted saved-view reads until after hydration', () => {
    const source = readFileSync(
      resolve(process.cwd(), LIBRARY_SURFACE_SOURCE),
      'utf8'
    );

    expect(source).toContain(
      "const [savedView, setSavedView] = useState<LibrarySavedViewId>('all');"
    );
    expect(source).toContain('setSavedView(readPersistedLibrarySavedView());');
    expect(source).not.toContain(
      'useState<LibrarySavedViewId>(() =>\n    readPersistedLibrarySavedView()'
    );
  });

  it('renders an empty read-only library state with a releases escape hatch', () => {
    renderLibrary([]);

    expect(screen.getByText('No Library Items')).toBeDefined();
    expect(
      screen.getByText(
        'Releases, merch, images, videos, and audio will appear here as they land.'
      )
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open Releases' })).toHaveAttribute(
      'href',
      APP_ROUTES.RELEASES
    );
  });

  it('defaults to list view on first load', () => {
    renderLibrary([buildAsset()]);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Apr 28')).toHaveAttribute('title', 'Apr 28, 2026');
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /View Take Me Over/u })
    ).toBeNull();
  });

  it('shows the card-size toggle in grid view and persists density preference', () => {
    renderLibrary([buildAsset()]);

    expect(
      screen.queryByTestId('library-grid-density-toggle')
    ).not.toBeInTheDocument();

    clickGridView();
    expect(
      screen.getByTestId('library-grid-density-toggle')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Small cards/u }));
    expect(window.localStorage.getItem('jovie:library-grid-density')).toBe(
      'compact'
    );

    fireEvent.click(screen.getByRole('button', { name: /Large cards/u }));
    expect(window.localStorage.getItem('jovie:library-grid-density')).toBe(
      'spacious'
    );
  });

  it('renders aspect-ratio-aware artwork frames in grid cards', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'video-landscape',
        title: 'Music Video',
        itemKind: 'video',
        assetKinds: ['artwork', 'video'],
      }),
      buildAsset({
        id: 'video-portrait',
        title: 'Reel',
        itemKind: 'video',
        mediaOrientation: 'portrait',
        assetKinds: ['artwork', 'video'],
      }),
    ]);
    clickGridView();

    const releaseCard = screen
      .getByRole('button', { name: /View Take Me Over/u })
      .querySelector('.system-b-library-card-artwork');
    const landscapeCard = screen
      .getByRole('button', { name: /View Music Video/u })
      .querySelector('.system-b-library-card-artwork');
    const portraitCard = screen
      .getByRole('button', { name: /View Reel/u })
      .querySelector('.system-b-library-card-artwork');

    expect(releaseCard?.className).toContain('aspect-square');
    expect(landscapeCard?.className).toContain('aspect-video');
    expect(portraitCard?.className).toContain('aspect-[9/16]');
  });

  it('surfaces Approval Status on list rows, grid cards, and filter chips (#10384)', async () => {
    renderLibrary([
      buildAsset({
        status: 'released',
        approvalStatus: 'draft',
      }),
      buildAsset({
        id: 'release-2',
        title: 'Second Track',
        status: 'released',
        approvalStatus: 'needs_review',
      }),
      buildAsset({
        id: 'release-3',
        title: 'Third Track',
        status: 'draft',
        approvalStatus: 'approved',
      }),
    ]);

    // List view includes the Approval column cell for every row.
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveTextContent('Draft');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveAccessibleName('Approval Status: Draft');
    expect(
      screen.getByTestId('library-approval-status-release-2')
    ).toHaveTextContent('Needs Review');
    expect(
      screen.getByTestId('library-release-status-release-1')
    ).toHaveTextContent('Released');

    clickGridView();

    // Grid cards surface both axes with explicit labels so Release "Draft"
    // never collides with Approval "Draft" (#10384 / JOV-3333).
    expect(
      screen.getByTestId('library-release-status-release-1')
    ).toHaveTextContent('Released');
    expect(
      screen.getByTestId('library-release-status-release-1')
    ).toHaveAccessibleName('Release Status: Released');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveTextContent('Draft');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveAccessibleName('Approval Status: Draft');
    expect(
      screen.getByTestId('library-approval-status-release-2')
    ).toHaveTextContent('Needs Review');

    // Filter rail exposes Approval Status as a first-class chip group (#10384).
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    const rail = screen.getByTestId('library-filter-panel');
    expect(screen.getByRole('group', { name: 'Library Filters' })).toBe(rail);
    expect(within(rail).getByText('Approval Status')).toBeInTheDocument();
    expect(within(rail).getByText('Release Status')).toBeInTheDocument();
    expect(
      within(rail).getByRole('button', { name: /Needs Review/u })
    ).toBeInTheDocument();

    fireEvent.click(
      within(rail).getByRole('button', { name: /Needs Review/u })
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('library-approval-status-release-2')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('library-approval-status-release-1')
      ).toBeNull();
      expect(
        screen.queryByTestId('library-approval-status-release-3')
      ).toBeNull();
    });
  });

  it('disambiguates Release Draft from Approval Draft when both axes are draft (#10384)', () => {
    renderLibrary([
      buildAsset({
        status: 'draft',
        approvalStatus: 'draft',
      }),
    ]);

    expect(
      screen.getByTestId('library-release-status-release-1')
    ).toHaveAccessibleName('Release Status: Draft');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveAccessibleName('Approval Status: Draft');

    clickGridView();

    expect(
      screen.getByTestId('library-release-status-release-1')
    ).toHaveAccessibleName('Release Status: Draft');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveAccessibleName('Approval Status: Draft');
  });

  it('filters Release Draft and Approval Draft independently in the filter rail (#10384)', async () => {
    renderLibrary([
      buildAsset({
        id: 'release-a',
        title: 'Release Draft Only',
        status: 'draft',
        approvalStatus: 'approved',
      }),
      buildAsset({
        id: 'release-b',
        title: 'Approval Draft Only',
        status: 'released',
        approvalStatus: 'draft',
      }),
      buildAsset({
        id: 'release-c',
        title: 'Both Draft',
        status: 'draft',
        approvalStatus: 'draft',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    const rail = screen.getByTestId('library-filter-panel');

    const approvalSection = within(rail)
      .getByText('Approval Status')
      .closest('div');
    expect(approvalSection).not.toBeNull();
    const releaseSection = within(rail)
      .getByText('Release Status')
      .closest('div');
    expect(releaseSection).not.toBeNull();

    // Scope Draft clicks to each section so dual "Draft" chips stay independent.
    const releaseDraftChip = within(releaseSection as HTMLElement).getByRole(
      'button',
      { name: /^Draft /u }
    );
    fireEvent.click(releaseDraftChip);

    await waitFor(() => {
      expect(
        screen.getByTestId('library-release-status-release-a')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('library-release-status-release-c')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('library-release-status-release-b')
      ).toBeNull();
    });

    fireEvent.click(
      within(rail).getByRole('button', { name: /Clear Filters/u })
    );

    const approvalDraftChip = within(approvalSection as HTMLElement).getByRole(
      'button',
      { name: /^Draft /u }
    );
    fireEvent.click(approvalDraftChip);

    await waitFor(() => {
      expect(
        screen.getByTestId('library-approval-status-release-b')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('library-approval-status-release-c')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('library-approval-status-release-a')
      ).toBeNull();
    });
  });

  it('renders Archived approval status on list and grid badges (#10384)', () => {
    renderLibrary([
      buildAsset({
        status: 'released',
        approvalStatus: 'archived',
      }),
    ]);

    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveTextContent('Archived');
    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveAccessibleName('Approval Status: Archived');

    clickGridView();

    expect(
      screen.getByTestId('library-approval-status-release-1')
    ).toHaveTextContent('Archived');
  });

  it('keeps Approval Status once in the detail rail editor only', () => {
    renderLibrary([
      buildAsset({ status: 'released', approvalStatus: 'draft' }),
    ]);

    fireEvent.click(screen.getByTestId('library-release-row-release-1'));

    const drawer = within(screen.getByTestId('library-asset-drawer'));
    // Hero shows release status only — no duplicate approval pill.
    expect(
      drawer.getByTestId('library-release-status-release-1')
    ).toHaveTextContent('Released');
    expect(
      drawer.queryByTestId('library-approval-status-release-1')
    ).not.toBeInTheDocument();
    // Editable approval lives exactly once under Details.
    expect(
      drawer.getByRole('button', { name: 'Approval Status' })
    ).toBeInTheDocument();
    expect(
      drawer.getAllByRole('button', { name: 'Approval Status' })
    ).toHaveLength(1);
  });

  it('keeps the approval status inline control labelled after the details refactor', () => {
    renderLibrary([buildAsset({ approvalStatus: 'draft' })]);

    fireEvent.click(screen.getByTestId('library-release-row-release-1'));

    const trigger = screen.getByTestId(
      'library-approval-status-select-release-1'
    );
    expect(trigger).toHaveAccessibleName('Approval Status');
    expect(trigger.tagName).toBe('BUTTON');
  });

  it('renders release assets with grid cards and a read-only detail drawer', () => {
    renderLibrary([buildAsset()]);
    clickGridView();

    expect(screen.getByTestId('library-surface')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Take Me Over' })).toBeDefined();
    expect(screen.getByText('Tim White')).toBeDefined();
    expect(screen.getAllByText('Artwork').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lyrics').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /View Take Me Over/u }));

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    const drawer = within(screen.getByTestId('library-asset-drawer'));
    expect(
      drawer.getByRole('button', {
        name: 'More actions',
      })
    ).toBeInTheDocument();
    // Approval status stays a single accessible editor in the default-open
    // Details section while the drawer sections remain single-open.
    expect(
      drawer.getByRole('button', { name: 'Approval Status' })
    ).toBeInTheDocument();
    fireEvent.click(drawer.getByRole('button', { name: 'Providers' }));
    expect(drawer.getByRole('link', { name: /Spotify/u })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/take-me-over'
    );
    fireEvent.click(drawer.getByRole('button', { name: 'Audio' }));
    expect(
      drawer.getAllByRole('button', {
        name: /Play Preview for Take Me Over/u,
      }).length
    ).toBeGreaterThan(0);
    fireEvent.click(drawer.getByRole('button', { name: 'Details' }));
    expect(drawer.getByText('Apr 28')).toHaveAttribute('title', 'Apr 28, 2026');
    expect(drawer.getByText('68/100')).toBeDefined();
    expect(drawer.getByText('Progressive House')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('copies the canonical share URL from the drawer overflow menu', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderLibrary([
      buildAsset({
        share: {
          assetId: 'release-1',
          visibility: 'private',
          shareSlug: 'take-me-over',
          accessToken: 'token-1',
          shareUrl: 'https://jov.ie/p/token-1',
          tokenRevokedAt: null,
        },
      }),
    ]);
    clickGridView();

    await user.click(
      screen.getByRole('button', { name: /View Take Me Over/u })
    );
    const drawer = within(screen.getByTestId('library-asset-drawer'));

    await user.click(drawer.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy Share Link' }));

    expect(writeText).toHaveBeenCalledWith('https://jov.ie/p/token-1');
  });

  it('rolls back profile visibility when the canonical mutation fails', async () => {
    const user = userEvent.setup();
    libraryMutationMocks.updateProfileVisibility.mockRejectedValueOnce(
      new Error('network failure')
    );

    render(
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={[buildAsset()]} profileId='profile-1' />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    );

    const actions = within(screen.getByTestId('library-row-actions-release-1'));
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Hide from Profile' })
    );

    await waitFor(() => {
      expect(libraryMutationMocks.updateProfileVisibility).toHaveBeenCalledWith(
        {
          profileId: 'profile-1',
          assetId: 'release-1',
          itemKind: 'release',
          profileVisibility: 'hidden',
        }
      );
    });

    await user.click(actions.getByRole('button', { name: 'More actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'Hide from Profile' })
    ).toBeInTheDocument();
  });

  it('rolls an optimistically archived release back into the table on failure', async () => {
    const user = userEvent.setup();
    libraryMutationMocks.archiveRelease.mockRejectedValueOnce(
      new Error('network failure')
    );

    render(
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={[buildAsset()]} profileId='profile-1' />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    );

    const actions = within(screen.getByTestId('library-row-actions-release-1'));
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => {
      expect(libraryMutationMocks.archiveRelease).toHaveBeenCalledWith({
        releaseId: 'release-1',
      });
      expect(
        screen.getByTestId('library-release-row-release-1')
      ).toBeInTheDocument();
    });
  });

  it('moves releases between active and Archived views through the shared action registry', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={[buildAsset()]} profileId='profile-1' />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    );

    let actions = within(screen.getByTestId('library-row-actions-release-1'));
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => {
      expect(libraryMutationMocks.archiveRelease).toHaveBeenCalledWith({
        releaseId: 'release-1',
      });
      expect(
        screen.queryByTestId('library-release-row-release-1')
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Archived/u }));
    actions = within(screen.getByTestId('library-row-actions-release-1'));
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Restore' }));

    await waitFor(() => {
      expect(libraryMutationMocks.restoreRelease).toHaveBeenCalledWith({
        releaseId: 'release-1',
      });
      expect(
        screen.queryByTestId('library-release-row-release-1')
      ).not.toBeInTheDocument();
    });
  });

  it('archives and safely restores merch through its real lifecycle contract', async () => {
    const user = userEvent.setup();
    const merch = buildAsset({
      id: 'merch-card-1',
      itemKind: 'merch',
      previewUrl: null,
      videoUrl: null,
      assetKinds: ['artwork'],
    });
    render(
      <TooltipProvider>
        <RightPanelProvider>
          <LibrarySurface assets={[merch]} profileId='profile-1' />
          <RightPanelOutlet />
        </RightPanelProvider>
      </TooltipProvider>
    );

    let actions = within(
      screen.getByTestId('library-row-actions-merch-card-1')
    );
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => {
      expect(libraryMutationMocks.archiveMerch).toHaveBeenCalledWith({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      });
    });

    await user.click(screen.getByRole('button', { name: /Archived/u }));
    actions = within(screen.getByTestId('library-row-actions-merch-card-1'));
    await user.click(actions.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Restore' }));

    await waitFor(() => {
      expect(libraryMutationMocks.restoreMerch).toHaveBeenCalledWith({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      });
    });
  });

  it('renders merch assets with prices and the shared detail drawer', () => {
    renderLibrary([
      buildAsset({
        id: 'merch-card-1',
        title: 'Never Say A Word Hoodie',
        artworkUrl: 'https://cdn.example.com/hoodie.png',
        smartLinkPath: '/app/library?view=merch',
        releaseDate: '2026-05-25T00:00:00.000Z',
        itemKind: 'merch',
        itemStatusLabel: 'Draft',
        primaryActionLabel: 'Open Merch',
        primaryActionHref: '/app/library?view=merch',
        productType: 'hoodie',
        salePriceLabel: '$68.00',
        profitLabel: '$22.00',
        description: 'Black hoodie with Never Say A Word cover art.',
        previewUrl: null,
        providerCount: 0,
        providers: [],
        hasLyrics: false,
        assetKinds: ['artwork'],
      }),
    ]);
    clickGridView();

    expect(
      screen.getByRole('heading', { name: 'Never Say A Word Hoodie' })
    ).toBeInTheDocument();
    expect(screen.getByText('$68.00')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /View Never Say A Word Hoodie/u,
      })
    );

    const drawer = within(screen.getByTestId('library-asset-drawer'));
    expect(drawer.getAllByText('Merch').length).toBeGreaterThan(0);
    expect(
      drawer.getByText('Black hoodie with Never Say A Word cover art.')
    ).toBeInTheDocument();
    expect(drawer.getByText('$22.00')).toBeInTheDocument();
    expect(drawer.queryByText('$9.00')).toBeNull();
    expect(
      drawer.getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('library-audio-dropzone')).toBeNull();
  });

  it('renders the library right rail with the shared compact entity anatomy', () => {
    renderLibrary([buildAsset()]);
    clickGridView();

    fireEvent.click(screen.getByRole('button', { name: /View Take Me Over/u }));

    const drawer = screen.getByTestId('library-asset-drawer');
    const entityHeader = screen.getByTestId('library-asset-entity-header');

    expect(entityHeader).toContainElement(
      screen.getByRole('button', { name: 'More actions' })
    );
    expect(within(entityHeader).getByText('Take Me Over')).toBeInTheDocument();
    const workspace = drawer.querySelector('[data-right-rail-workspace]');
    expect(workspace).toHaveAttribute('data-surface-variant', 'raised');
    expect(drawer.textContent).toContain('Details');
    expect(drawer.textContent).toContain('Providers');
  });

  it('uses shell focus tokens for library cards and drawer actions', () => {
    renderLibrary([buildAsset()]);
    clickGridView();

    const assetCardButton = screen.getByRole('button', {
      name: /View Take Me Over/u,
    });

    expect(assetCardButton.className).toContain(
      'focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
    );
    expect(assetCardButton.className).toContain(
      'focus-visible:ring-offset-(--linear-app-content-surface)'
    );
    expect(assetCardButton.className).not.toContain('focus-visible:shadow');

    fireEvent.click(assetCardButton);

    const drawer = within(screen.getByTestId('library-asset-drawer'));
    const overflowButton = drawer.getByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(drawer.getByRole('button', { name: 'Audio' }));
    const [previewButton] = drawer.getAllByRole('button', {
      name: /Play Preview for Take Me Over/u,
    });
    if (!previewButton) {
      throw new Error('Expected a drawer preview button');
    }
    fireEvent.click(drawer.getByRole('button', { name: 'Providers' }));
    const providerLink = drawer.getByRole('link', { name: /Spotify/u });

    expect(overflowButton.className).toContain('focus-visible:ring-ring');
    for (const element of [previewButton, providerLink]) {
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

    expect(screen.getByRole('table')).toBeInTheDocument();
    clickGridView();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
  });

  it('switches to the catalog table view with explicit columns and persists the choice', () => {
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    // Defaults to list (header hidden, release rows present).
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table View' }));

    // Catalog rows render with the minimal column header.
    expect(
      screen.getByTestId('library-catalog-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-catalog-row-release-2')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Title' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Release Date' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Artist' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Type' })
    ).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(window.localStorage.getItem('jovie:library-view-mode')).toBe(
      'table'
    );

    // No regression: switching back to list restores release rows.
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('library-catalog-row-release-1')
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem('jovie:library-view-mode')).toBe('list');
  });

  it('starts the persistent player from real production preview data', () => {
    renderLibrary([buildAsset()]);

    fireEvent.click(screen.getByTestId('library-preview-row-release-1'));

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

    fireEvent.click(screen.getByTestId('library-release-row-release-1'));

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

    fireEvent.click(screen.getByTestId('library-release-row-release-1'));
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
    await waitFor(() => {
      expect(
        within(screen.getByTestId('library-asset-drawer')).getAllByRole(
          'button',
          { name: /Play Preview for Take Me Over/u }
        ).length
      ).toBeGreaterThan(0);
    });
  });

  it('opens the read-only asset drawer from list rows', () => {
    renderLibrary([buildAsset()]);

    const row = screen.getByTestId('library-release-row-release-1');

    fireEvent.click(row);

    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row.className).toContain('system-b-library-table-row-selected');
    expect(
      within(screen.getByTestId('library-asset-drawer')).getByRole('button', {
        name: 'More actions',
      })
    ).toBeInTheDocument();
  });

  it('does not render route filtering as a second shell search surface', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));

    expect(screen.queryByLabelText('Filter library assets')).toBeNull();
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-release-row-release-2')
    ).toBeInTheDocument();
  });

  it('filters library assets from sidebar smart filter views', async () => {
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
        previewUrl: null,
        assetKinds: ['artwork', 'lyrics', 'providers'],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(
      screen.getByTestId('library-saved-filter-views')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Needs Attention/u }));

    await waitFor(() => {
      expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
      expect(screen.queryByText('Take Me Over')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^All Items/u }));

    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
  });

  it('filters library assets from top-level view chips', async () => {
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

    expect(screen.getByTestId('library-view-filter-chips')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Audio/u }));

    await waitFor(() => {
      expect(screen.getByText('Take Me Over')).toBeInTheDocument();
      expect(screen.queryByText('Never Say A Word')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^All/u }));

    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
  });

  it('keeps global header search as the only Library search surface', () => {
    renderLibraryWithHeader([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    expect(screen.queryByLabelText('Search library by title')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Search Jovie' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
    expect(
      screen.queryByRole('searchbox', { name: 'Command Palette Search' })
    ).toBeNull();
  });

  it('labels the grid-card provider count badge', () => {
    renderLibrary([buildAsset({ providerCount: 3 })]);
    clickGridView();

    expect(screen.getByRole('img', { name: '3 Providers' })).toHaveTextContent(
      '3'
    );
  });

  it('stacks duplicate release versions into one row (JOV-3089)', () => {
    renderLibrary([
      buildAsset({
        id: 'release-1',
        title: 'All This Noise EP',
        trackCount: 6,
      }),
      buildAsset({
        id: 'release-2',
        title: 'All This Noise (Remixed)',
        trackCount: 0,
      }),
    ]);

    // The most complete ingest survives; the near-duplicate stacks behind it.
    expect(
      screen.getByTestId('library-release-row-release-1')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('library-release-row-release-2')
    ).not.toBeInTheDocument();
  });

  it('keeps Library inside the standard app shell without a route sidebar takeover', async () => {
    renderLibraryWithSidebarProbe([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    const contract = await screen.findByTestId('library-sidebar-override');

    await waitFor(() => expect(contract).toHaveTextContent('missing'));
    expect(contract).not.toHaveAttribute('data-key');
    expect(contract).not.toHaveAttribute('data-back-href');
    expect(contract).not.toHaveAttribute('data-back-label');
    expect(screen.getByTestId('library-view-filter-chips')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merch/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Audio/u })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByTestId('library-filter-panel')).toBeInTheDocument();
    expect(
      screen.getByTestId('library-saved-filter-views')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /All Releases/u })
    ).not.toBeInTheDocument();
  });

  it('presents the shared filter panel in a desktop popover with Escape focus return', async () => {
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

    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Never Say A Word',
        artist: 'Other Artist',
      }),
    ]);

    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Show filters' });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('library-filter-popover')).toHaveAccessibleName(
      'Library Filters'
    );
    expect(screen.getByTestId('library-filter-panel')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByTestId('library-filter-popover')
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('keeps every saved view and facet reachable from the shared filter panel', async () => {
    const user = userEvent.setup();
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Scheduled Album',
        releaseType: 'album',
        status: 'scheduled',
        approvalStatus: 'needs_review',
        previewUrl: null,
        videoUrl: 'https://cdn.example.com/video.mp4',
        providers: [
          {
            key: 'apple',
            label: 'Apple Music',
            url: 'https://music.apple.com/album/scheduled-album',
          },
        ],
        assetKinds: ['artwork', 'video', 'providers'],
      }),
    ]);

    const filterTrigger = screen.getByRole('button', {
      name: 'Show filters',
    });
    expect(filterTrigger).toHaveClass('h-7', 'w-7');
    expect(
      screen.queryByTestId('library-filter-active-indicator')
    ).not.toBeInTheDocument();

    await user.click(filterTrigger);
    const panel = screen.getByTestId('library-filter-panel');
    const savedViews = within(panel).getByTestId('library-saved-filter-views');

    for (const savedView of [
      'All Items',
      'Scheduled',
      'Drafts',
      'Needs Attention',
      'Updated This Week',
      'Live Merch',
    ]) {
      expect(
        within(savedViews).getByRole('button', {
          name: new RegExp(`^${savedView} `, 'u'),
        })
      ).toBeInTheDocument();
    }

    for (const facet of [
      'Approval Status',
      'Release Status',
      'Type',
      'Assets',
      'Providers',
    ]) {
      expect(within(panel).getByText(facet)).toBeInTheDocument();
    }

    expect(
      within(panel).getByRole('button', { name: /Needs Review/u })
    ).toBeInTheDocument();
    expect(
      within(panel).getAllByRole('button', { name: /Scheduled/u })
    ).toHaveLength(2);
    expect(
      within(panel).getByRole('button', { name: /Album/u })
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /Video/u })
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /Apple Music/u })
    ).toBeInTheDocument();

    await user.click(
      within(panel).getByRole('button', { name: /Needs Review/u })
    );
    expect(filterTrigger).toHaveAttribute('aria-label', 'Show filters (1)');
    expect(
      screen.getByTestId('library-filter-active-indicator')
    ).toBeInTheDocument();
  });

  it('restores URL presets and persisted smart filters without changing their contracts', async () => {
    navigationMock.searchParams = new URLSearchParams('view=audio');
    window.localStorage.setItem(
      LIBRARY_SAVED_VIEW_STORAGE_KEY,
      'needs-attention'
    );

    const user = userEvent.setup();
    renderLibrary([
      buildAsset(),
      buildAsset({
        id: 'release-2',
        title: 'Missing Audio',
        previewUrl: null,
        assetKinds: ['artwork', 'providers'],
      }),
    ]);

    expect(screen.getByRole('button', { name: /Audio/u })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('Take Me Over')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing Audio')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All /u }));
    expect(navigationMock.replace).toHaveBeenCalledWith(APP_ROUTES.LIBRARY, {
      scroll: false,
    });
    expect(screen.queryByText('Take Me Over')).not.toBeInTheDocument();
    expect(screen.getByText('Missing Audio')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(
      screen.getByRole('button', { name: /Needs Attention/u })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses a mobile overlay without moving content, losing scroll, or hiding the asset drawer', async () => {
    const user = userEvent.setup();
    Object.defineProperty(globalThis, 'scrollY', {
      configurable: true,
      value: 320,
    });

    renderLibrary([buildAsset()]);
    fireEvent.click(screen.getByTestId('library-release-row-release-1'));

    const contentFrame = screen.getByTestId('library-content-frame');
    const before = contentFrame.getBoundingClientRect();
    const trigger = screen.getByRole('button', { name: 'Show filters' });
    expect(trigger).toHaveClass('h-7', 'w-7');
    expect(trigger.className).toContain('before:h-10');
    expect(trigger.className).toContain('before:min-w-10');
    expect(trigger.className).not.toContain('min-h-11');
    expect(trigger.className).not.toContain('min-w-11');

    await user.click(trigger);

    const sheet = screen.getByTestId('library-filter-sheet');
    expect(sheet).toBeInTheDocument();
    expect(screen.getByTestId('library-surface').contains(sheet)).toBe(false);
    expect(screen.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    const afterOpen = contentFrame.getBoundingClientRect();
    expect({
      x: afterOpen.x,
      y: afterOpen.y,
      width: afterOpen.width,
      height: afterOpen.height,
    }).toEqual({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByTestId('library-filter-sheet')
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
    expect(globalThis.scrollY).toBe(320);
  });
});
