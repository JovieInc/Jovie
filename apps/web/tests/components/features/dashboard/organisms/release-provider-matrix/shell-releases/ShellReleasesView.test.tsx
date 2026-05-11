import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { ReleaseViewModel } from '@/lib/discography/types';

const mockUsePlanGate = vi.fn(() => ({
  isLoading: false,
  isError: false,
  smartLinksLimit: null as number | null,
  isPro: true,
  canCreateManualReleases: true,
  canGenerateAlbumArt: false,
  canGenerateReleasePlans: true,
  canEditSmartLinks: true,
  canAccessFutureReleases: true,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/dashboard/releases',
}));

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
}));

vi.mock('@/lib/feature-flags/client', () => ({
  useCodeFlag: () => false,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  revertReleaseArtwork: vi.fn(),
  connectAppleMusicArtist: vi.fn(() =>
    Promise.resolve({ success: true, message: 'ok' })
  ),
  deleteRelease: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/catalog-task-actions', () => ({
  instantiateReleaseTasksFromCatalog: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/task-actions', () => ({
  instantiateReleaseTasks: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/chat/open-chat-with-prompt', () => ({
  openChatWithPrompt: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useImportPolling',
  () => ({
    useImportPolling: () => ({ importedCount: 0, totalCount: 0 }),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ImportProgressBanner',
  () => ({
    ImportProgressBanner: () => <div data-testid='import-progress-banner' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner',
  () => ({
    AppleMusicSyncBanner: () => <div data-testid='apple-music-sync-banner' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner',
  () => ({
    SmartLinkGateBanner: ({ mode }: { mode: string }) => (
      <div data-testid={`smart-link-gate-banner-${mode}`} />
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog',
  () => ({
    SpotifyConnectDialog: ({ open }: { open: boolean }) =>
      open ? <div data-testid='spotify-connect-dialog' /> : null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasePlanWizard',
  () => ({
    ReleasePlanWizard: () => <div data-testid='release-plan-wizard' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar',
  () => ({
    AddReleaseSidebar: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? (
        <aside data-testid='add-release-sidebar'>Add release</aside>
      ) : null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/NewReleaseHeaderAction',
  () => ({
    NewReleaseHeaderAction: ({
      canCreateManualReleases,
      isSyncing,
      onSyncSpotify,
      onCreateManual,
    }: {
      canCreateManualReleases: boolean;
      isSyncing: boolean;
      onSyncSpotify: () => void;
      onCreateManual: () => void;
    }) => (
      <div data-testid='new-release-header-action'>
        <button
          type='button'
          data-testid='sync-spotify-action'
          disabled={isSyncing}
          onClick={onSyncSpotify}
        >
          {isSyncing ? 'Syncing' : 'Sync'}
        </button>
        {canCreateManualReleases ? (
          <button
            type='button'
            data-testid='create-manual-action'
            onClick={onCreateManual}
          >
            New release
          </button>
        ) : null}
      </div>
    ),
  })
);

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => null,
}));

vi.mock('@/components/organisms/DialogLoadingSkeleton', () => ({
  DialogLoadingSkeleton: () => null,
}));

vi.mock('@/lib/queries', () => {
  const mutation = {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };

  return {
    useFormatReleaseLyricsMutation: () => mutation,
    useRefreshReleaseMutation: () => mutation,
    useRescanIsrcLinksMutation: () => mutation,
    useResetProviderOverrideMutation: () => mutation,
    useSaveCanvasStatusMutation: () => mutation,
    useSavePrimaryIsrcMutation: () => mutation,
    useSaveProviderOverrideMutation: () => mutation,
    useSaveReleaseLyricsMutation: () => mutation,
    useSaveReleaseMetadataMutation: () => mutation,
    useSaveReleaseTargetPlaylistsMutation: () => mutation,
    useSyncReleasesFromSpotifyMutation: () => mutation,
    usePlanGate: () => mockUsePlanGate(),
  };
});

vi.mock('@/components/atoms/table-action-menu/TableActionMenu', () => ({
  TableActionMenu: ({
    children,
    items,
  }: {
    children: React.ReactNode;
    items: Array<{
      id: string;
      label: string;
      onClick?: () => void;
      children?: Array<{ id: string; label: string; onClick?: () => void }>;
    }>;
  }) => (
    <div>
      {children}
      <div data-testid='mock-release-actions'>
        {items
          .flatMap(item =>
            item.children && item.children.length > 0 ? item.children : [item]
          )
          .map(item => (
            <button
              key={item.id}
              type='button'
              onClick={event => {
                event.stopPropagation();
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: ({
    release,
    onClose,
    onReleaseChange,
  }: {
    release: ReleaseViewModel | null;
    onClose?: () => void;
    onReleaseChange?: (release: ReleaseViewModel) => void;
  }) =>
    release ? (
      <aside data-testid='release-sidebar'>
        <div>{release.title}</div>
        <button type='button' onClick={onClose}>
          Close
        </button>
        <button
          type='button'
          onClick={() => onReleaseChange?.({ ...release, title: 'Edited' })}
        >
          Save Edit
        </button>
      </aside>
    ) : null,
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve(true)),
}));

function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1db954' },
} as Parameters<typeof ShellReleasesView>[0]['providerConfig'];

const primaryProviders: Parameters<
  typeof ShellReleasesView
>[0]['primaryProviders'] = ['spotify'];

function RightPanelProbe() {
  const panel = useRightPanel();
  return <div data-testid='right-panel-probe'>{panel}</div>;
}

function HeaderActionsProbe() {
  const state = useOptionalHeaderActions();
  return <div data-testid='header-actions-probe'>{state?.headerActions}</div>;
}

function renderShell(
  releases: readonly ReleaseViewModel[],
  extraProps: Partial<Parameters<typeof ShellReleasesView>[0]> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HeaderActionsProvider>
        <RightPanelProvider>
          {/* Mimics the AuthShell header slot so the route's registered
              header actions (search trigger + new-release affordance) render
              in the DOM where tests can inspect them. */}
          <ShellReleasesView
            releases={releases}
            providerConfig={providerConfig}
            primaryProviders={primaryProviders}
            artistName='Bahamas'
            {...extraProps}
          />
          <HeaderActionsProbe />
          <RightPanelProbe />
        </RightPanelProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUsePlanGate.mockReturnValue({
    isLoading: false,
    isError: false,
    smartLinksLimit: null,
    isPro: true,
    canCreateManualReleases: true,
    canGenerateAlbumArt: false,
    canGenerateReleasePlans: true,
    canEditSmartLinks: true,
    canAccessFutureReleases: true,
  });
});

describe('ShellReleasesView', () => {
  it('renders one row per release with title + artist', () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Lost in the Light' }),
      fakeRelease({
        id: '2',
        title: 'Take Me Over',
        artistNames: ['Other'],
      }),
    ]);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows the connect-Spotify empty state when not yet connected', () => {
    renderShell([]);
    expect(
      screen.getByText(/Connect Spotify to get started/)
    ).toBeInTheDocument();
  });

  it('shows the connected empty state when connected with no releases', () => {
    renderShell([], { spotifyConnected: true });
    expect(screen.getByText(/No releases yet/)).toBeInTheDocument();
  });

  it('opens and dismisses the production release drawer from a row', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    const row = screen.getByRole('option', { name: /Lost in the Light/ });
    expect(row).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(row).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByTestId('release-sidebar')).not.toBeInTheDocument();
    });
  });

  it('keeps selected row in sync when the drawer edits a release', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(screen.getByRole('option', { name: /Lost in the Light/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save Edit' }));

    expect(screen.getByRole('option', { name: /Edited/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('exposes production row actions for edit and smart-link copy', async () => {
    const { copyToClipboard } = await import('@/hooks/useClipboard');

    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Release actions for Lost in the Light',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit release links' }));

    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy smart link' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('/lost-in-the-light')
      );
    });
  });

  it('registers header actions exposing the release count in the search trigger', async () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Alpha' }),
      fakeRelease({ id: '2', title: 'Beta' }),
    ]);
    // The route registers headerActions (not a structured adapter) so the shell
    // header slot renders an inline search trigger with the visible count.
    // Use findByTestId so we wait for the effect that calls setHeaderActions to run.
    const probe = await screen.findByTestId('header-actions-probe');
    expect(probe).toBeInTheDocument();
    // The closed search trigger has aria-label="Search releases" and renders the count.
    const searchTrigger = await screen.findByRole('button', {
      name: /search releases/i,
    });
    expect(searchTrigger).toHaveTextContent('2');
  });

  describe('entitlement gating', () => {
    it('shows open smart-link affordance for fully entitled users', () => {
      renderShell([
        fakeRelease({
          id: 'r1',
          title: 'Open Track',
          releaseDate: '2024-01-01',
        }),
      ]);

      expect(
        screen.getByLabelText('Open smart link for Open Track')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Smart link locked \(Pro\)/)
      ).not.toBeInTheDocument();
    });

    it('locks scheduled releases for free users without canAccessFutureReleases', async () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      expect(
        screen.getByLabelText('Scheduled smart link (Pro) for Upcoming Drop')
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Open smart link for Upcoming Drop')
      ).not.toBeInTheDocument();
      expect(
        await screen.findByTestId('smart-link-gate-banner-unreleased')
      ).toBeInTheDocument();
    });

    it('locks releases beyond smartLinksLimit with cap reason', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: 1,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([
        fakeRelease({
          id: 'old',
          title: 'Older Release',
          releaseDate: '2020-01-01',
        }),
        fakeRelease({
          id: 'new',
          title: 'Newer Release',
          releaseDate: '2024-01-01',
        }),
      ]);

      // Cap allows oldest first up to limit — newer release is locked.
      expect(
        screen.getByLabelText('Smart link locked (Pro) for Newer Release')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Open smart link for Older Release')
      ).toBeInTheDocument();
    });

    it('gates the row action menu copy item when the smart link is locked', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: false,
      });

      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      renderShell([
        fakeRelease({
          id: 'future-1',
          title: 'Upcoming Drop',
          releaseDate: future,
        }),
      ]);

      // Row menu should expose the scheduled-lock label, not "Copy smart link".
      expect(
        screen.getByRole('button', { name: 'Scheduled smart link (Pro)' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Copy smart link' })
      ).not.toBeInTheDocument();
    });

    it('hides the manual create affordance when canCreateManualReleases is false', () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        isError: false,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: false,
        canGenerateAlbumArt: false,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderShell([], { spotifyConnected: true });

      expect(
        screen.queryByTestId('create-manual-action')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('shell-releases-create-connected-empty')
      ).not.toBeInTheDocument();
    });
  });
});
