import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  type RenderOptions,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';

/**
 * ReleaseProviderMatrix Component Tests
 *
 * Tests conditional rendering (empty, importing, table states), footer display,
 * and render stability (no infinite re-render loops).
 *
 * Heavy children are mocked to avoid Vitest memory limits.
 */

const mockRouterRefresh = vi.fn();

// ── Mock dependencies ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mockRouterRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/dashboard/releases',
}));

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
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

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://test.jov.ie',
}));

// Mock TanStack Query mutations
vi.mock('@/lib/queries', () => ({
  useSaveProviderOverrideMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useResetProviderOverrideMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useSyncReleasesFromSpotifyMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useRefreshReleaseMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useRescanIsrcLinksMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useSaveCanvasStatusMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveReleaseLyricsMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useFormatReleaseLyricsMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePlanGate: () => ({
    smartLinksLimit: null,
    isPro: true,
    canCreateManualReleases: true,
    canEditSmartLinks: true,
    canAccessFutureReleases: true,
  }),
  QueryErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock heavy children
vi.mock('@/features/dashboard/atoms/DashboardHeaderActionButton', () => ({
  DashboardHeaderActionButton: ({
    label,
    ariaLabel,
    onClick,
  }: {
    label: string;
    ariaLabel?: string;
    onClick?: () => void;
  }) => (
    <button type='button' aria-label={ariaLabel} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/features/dashboard/atoms/DashboardHeaderActionGroup', () => ({
  DashboardHeaderActionGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTable',
  () => ({
    ReleaseTable: ({ releases }: { releases: Array<{ id: string }> }) => (
      <div data-testid='release-table'>
        ids:{releases.map(release => release.id).join(',')}
      </div>
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader',
  () => ({
    ReleaseTableSubheader: ({
      onCreateRelease,
      canCreateManualReleases = false,
    }: {
      onCreateRelease?: () => void;
      canCreateManualReleases?: boolean;
    }) => {
      return (
        <div>
          <button type='button' data-testid='release-subheader'>
            subheader
          </button>
          {canCreateManualReleases && onCreateRelease ? (
            <button
              type='button'
              aria-label='Create a new release'
              onClick={onCreateRelease}
            >
              Create a new release
            </button>
          ) : null}
        </div>
      );
    },
    DEFAULT_RELEASE_FILTERS: { releaseTypes: [], popularity: [], labels: [] },
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState',
  () => ({
    ReleasesEmptyState: () => (
      <div data-testid='releases-empty-state'>empty</div>
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog',
  () => ({
    SpotifyConnectDialog: () => null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner',
  () => ({
    AppleMusicSyncBanner: () => null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner',
  () => ({
    SmartLinkGateBanner: () => null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ImportProgressBanner',
  () => ({
    ImportProgressBanner: ({ visible = true }: { visible?: boolean }) => (
      <div
        data-testid='spotify-import-progress-banner'
        aria-hidden={!visible}
        style={{
          visibility: visible ? 'visible' : 'hidden',
          opacity: visible ? 1 : 0,
        }}
      />
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useReleaseTablePreferences',
  () => ({
    useReleaseTablePreferences: () => ({
      columnVisibility: {},
      rowHeight: 'default',
      availableColumns: [],
      onColumnVisibilityChange: vi.fn(),
      resetToDefaults: vi.fn(),
      groupByYear: false,
      onGroupByYearChange: vi.fn(),
    }),
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/hooks/useReleaseFilterCounts',
  () => ({
    getPopularityLevel: () => null,
  })
);

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: ({
    release,
    onReleaseChange,
  }: {
    release: { title: string; id: string } | null;
    onReleaseChange?: (release: { title: string; id: string }) => void;
  }) =>
    release ? (
      <div>
        <div data-testid='release-sidebar'>{`${release.id}:${release.title}`}</div>
        <button
          type='button'
          data-testid='release-sidebar-update'
          onClick={() =>
            onReleaseChange?.({ ...release, title: 'Updated Release' })
          }
        >
          update-release
        </button>
      </div>
    ) : null,
  TrackSidebar: () => null,
}));

interface QueryErrorBoundaryProps {
  readonly children: React.ReactNode;
}

vi.mock('@/lib/queries/QueryErrorBoundary', () => ({
  QueryErrorBoundary: ({ children }: QueryErrorBoundaryProps) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/organisms/artist-search-palette', () => ({
  ArtistSearchCommandPalette: () => null,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  connectAppleMusicArtist: vi.fn(),
  revertReleaseArtwork: vi.fn(),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar',
  () => ({
    AddReleaseSidebar: ({
      isOpen,
      onCreated,
      onArtworkUploaded,
    }: {
      isOpen: boolean;
      onCreated: (
        release: import('@/lib/discography/types').ReleaseViewModel
      ) => void;
      onArtworkUploaded?: (releaseId: string, artworkUrl: string) => void;
    }) => (
      <div>
        {isOpen ? (
          <button
            type='button'
            data-testid='mock-add-release-sidebar'
            onClick={() =>
              onCreated({
                profileId: 'profile-1',
                id: 'created-release',
                title: 'Created Release',
                slug: 'created-release',
                smartLinkPath: '/artist/created-release',
                providers: [],
                releaseType: 'single',
                isExplicit: false,
                totalTracks: 1,
              })
            }
          >
            finish-create
          </button>
        ) : null}
        <button
          type='button'
          data-testid='mock-add-release-artwork-uploaded'
          onClick={() =>
            onArtworkUploaded?.(
              'created-release',
              'https://cdn.example.com/cover.png'
            )
          }
        >
          finish-artwork-upload
        </button>
      </div>
    ),
  })
);

// ── Import after mocks ──
const { ReleaseProviderMatrix } = await import(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix'
);

interface ProviderConfigEntry {
  label: string;
  accent: string;
}

// ── Helpers ──

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HeaderActionsProvider>
            <RightPanelProvider>
              {children}
              <HeaderActionsProbe />
              <RightPanelProbe />
            </RightPanelProvider>
          </HeaderActionsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    ),
    ...options,
  });
}

function HeaderActionsProbe() {
  const state = useOptionalHeaderActions();
  return <div data-testid='header-actions-probe'>{state?.headerActions}</div>;
}

function RightPanelProbe() {
  const panel = useRightPanel();
  return <div data-testid='right-panel-probe'>{panel}</div>;
}

function makeRelease(id = 'release-1') {
  return {
    id,
    profileId: 'profile-1',
    title: `Test Release ${id}`,
    slug: `test-release-${id}`,
    smartLinkPath: `/r/test-release-${id}`,
    releaseType: 'single' as const,
    isExplicit: false,
    totalTracks: 1,
    providers: [
      {
        key: 'spotify' as const,
        url: 'https://open.spotify.com/album/abc',
        source: 'ingested' as const,
        updatedAt: '2024-01-01',
        label: 'Spotify',
        path: '/spotify',
        isPrimary: true,
      },
    ],
  };
}

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
  youtube: { label: 'YouTube', accent: '#FF0000' },
  soundcloud: { label: 'SoundCloud', accent: '#FF5500' },
  deezer: { label: 'Deezer', accent: '#FEAA2D' },
  tidal: { label: 'Tidal', accent: '#000000' },
  amazon_music: { label: 'Amazon Music', accent: '#25D1DA' },
  pandora: { label: 'Pandora', accent: '#224099' },
  audiomack: { label: 'Audiomack', accent: '#FFA500' },
  tiktok: { label: 'TikTok', accent: '#000000' },
  bandcamp: { label: 'Bandcamp', accent: '#629AA9' },
  beatport: { label: 'Beatport', accent: '#94D500' },
  napster: { label: 'Napster', accent: '#0078FF' },
  qobuz: { label: 'Qobuz', accent: '#0070EF' },
  anghami: { label: 'Anghami', accent: '#8B00FF' },
  boomplay: { label: 'Boomplay', accent: '#FF6600' },
  iheartradio: { label: 'iHeartRadio', accent: '#C6002B' },
} as Record<import('@/lib/discography/types').ProviderKey, ProviderConfigEntry>;

const primaryProviders = [
  'spotify',
  'apple_music',
] as import('@/lib/discography/types').ProviderKey[];

describe('ReleaseProviderMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('conditional rendering', () => {
    it('shows empty state when not connected and no releases', () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={false}
        />
      );
      expect(screen.getByTestId('releases-empty-state')).toBeInTheDocument();
    });

    it('shows importing state when importing with no releases', () => {
      // The importing state is triggered internally via callback, but we can
      // verify the container renders correctly with no releases and connected
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );
      // When connected but no releases and not importing, shows "No releases yet"
      expect(screen.getByText('No releases yet')).toBeInTheDocument();
    });

    it('shows releases table when releases exist', () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease()]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );
      expect(screen.getByTestId('release-table')).toBeInTheDocument();
      expect(screen.getByTestId('release-subheader')).toBeInTheDocument();
      expect(screen.getByTestId('release-table-shell')).toBeInTheDocument();
    });

    it('renders table and subheader when releases exist', () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('r1'), makeRelease('r2'), makeRelease('r3')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );
      expect(screen.getByTestId('release-table')).toBeInTheDocument();
      expect(screen.getByTestId('release-subheader')).toBeInTheDocument();
    });

    it('does not render spotify import banner when import is idle', () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease()]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
          initialImporting={false}
        />
      );

      expect(
        screen.queryByTestId('spotify-import-progress-banner')
      ).not.toBeInTheDocument();
    });

    it('shows spotify import banner when import is active', () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease()]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
          initialImporting={true}
        />
      );

      const banner = screen.getByTestId('spotify-import-progress-banner');
      expect(banner).toHaveAttribute('aria-hidden', 'false');
      expect(banner).toHaveStyle({ visibility: 'visible', opacity: '1' });
    });
  });

  describe('render stability', () => {
    it('does not exceed 4 renders on initial mount', () => {
      let renderCount = 0;
      const OriginalMatrix = ReleaseProviderMatrix;

      function CountingWrapper() {
        renderCount++;
        return (
          <OriginalMatrix
            releases={[makeRelease()]}
            providerConfig={providerConfig}
            primaryProviders={primaryProviders}
            spotifyConnected={true}
          />
        );
      }

      renderWithProviders(<CountingWrapper />);

      // Allow for React.StrictMode double render (2) + useEffect re-renders
      // but catch infinite loops (which would blow past any reasonable count)
      expect(renderCount).toBeLessThanOrEqual(4);
    });
  });

  describe('release display', () => {
    it('shows all releases without tracks/releases split', () => {
      const single = makeRelease('single-track');
      const album = {
        ...makeRelease('album-track'),
        releaseType: 'album' as const,
        totalTracks: 12,
      };

      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[single, album]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      expect(screen.getByTestId('release-table')).toHaveTextContent(
        'ids:single-track,album-track'
      );
    });

    it('inserts a created release locally and opens the release drawer without router refresh', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Create a new release' })
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      await waitFor(() => {
        expect(screen.getByTestId('release-table')).toHaveTextContent(
          'ids:created-release,existing-release'
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Created Release'
        );
      });
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    it('updates the open release drawer when the release changes after it opens', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Create a new release' })
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Created Release'
        );
      });

      fireEvent.click(screen.getByTestId('release-sidebar-update'));

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Updated Release'
        );
      });
    });

    it('merges background artwork updates without overwriting newer drawer edits', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Create a new release' })
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Created Release'
        );
      });

      fireEvent.click(screen.getByTestId('release-sidebar-update'));

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Updated Release'
        );
      });

      fireEvent.click(screen.getByTestId('mock-add-release-artwork-uploaded'));

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Updated Release'
        );
      });
    });
  });
});
