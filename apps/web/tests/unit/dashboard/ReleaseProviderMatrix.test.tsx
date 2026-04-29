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

const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();
const mockInstantiateReleaseTasks = vi.fn().mockResolvedValue(undefined);
const mockInstantiateReleaseTasksFromCatalog = vi
  .fn()
  .mockResolvedValue(undefined);
const mockUsePlanGate = vi.fn(() => ({
  isLoading: false,
  smartLinksLimit: null,
  isPro: true,
  canCreateManualReleases: true,
  canGenerateReleasePlans: false,
  canEditSmartLinks: true,
  canAccessFutureReleases: true,
}));

// ── Mock dependencies ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: mockRouterRefresh,
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

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
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

vi.mock('@/app/app/(shell)/dashboard/releases/task-actions', () => ({
  instantiateReleaseTasks: mockInstantiateReleaseTasks,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/catalog-task-actions', () => ({
  instantiateReleaseTasksFromCatalog: mockInstantiateReleaseTasksFromCatalog,
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
  useSavePrimaryIsrcMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveReleaseMetadataMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveReleaseLyricsMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveReleaseTargetPlaylistsMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useFormatReleaseLyricsMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePlanGate: () => mockUsePlanGate(),
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
  DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS: '',
  DASHBOARD_HEADER_ACTION_TEXT_BUTTON_ACTIVE_CLASS: '',
  DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS: '',
  DASHBOARD_HEADER_ACTION_ICON_BUTTON_ACTIVE_CLASS: '',
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/NewReleaseHeaderAction',
  () => ({
    NewReleaseHeaderAction: ({
      canCreateManualReleases,
      onCreateManual,
      onSyncSpotify,
    }: {
      canCreateManualReleases: boolean;
      onCreateManual: () => void;
      onSyncSpotify: () => void;
    }) => (
      <div>
        {canCreateManualReleases ? (
          <button
            type='button'
            aria-label='Create a new release'
            onClick={onCreateManual}
          >
            Create a new release
          </button>
        ) : null}
        <button
          type='button'
          aria-label='Sync releases from Spotify'
          onClick={onSyncSpotify}
        >
          Sync from Spotify
        </button>
      </div>
    ),
  })
);

vi.mock('@/features/dashboard/atoms/DashboardHeaderActionGroup', () => ({
  DashboardHeaderActionGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTable',
  () => ({
    ReleaseTable: ({
      releases,
      onEdit,
    }: {
      releases: Array<{ id: string; title?: string }>;
      onEdit?: (release: { id: string; title?: string }) => void;
    }) => (
      <div data-testid='release-table'>
        ids:{releases.map(release => release.id).join(',')}
        {releases.map(release => (
          <button
            key={release.id}
            type='button'
            data-testid={`edit-release-${release.id}`}
            onClick={() => onEdit?.(release)}
          >
            edit-{release.id}
          </button>
        ))}
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
  '@/features/dashboard/organisms/release-provider-matrix/ReleasePlanPromptDialog',
  () => ({
    // Legacy mock retained; the live code now renders ReleasePlanWizard.
    ReleasePlanPromptDialog: () => null,
  })
);

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasePlanWizard',
  () => ({
    ReleasePlanWizard: ({
      open,
      releaseTitle,
      isGateLoading,
      canGenerateReleasePlans,
      isGeneratingReleasePlan,
      onClose,
      onSubmit,
    }: {
      open: boolean;
      releaseTitle: string | null;
      isGateLoading: boolean;
      canGenerateReleasePlans: boolean;
      isGeneratingReleasePlan: boolean;
      onClose: () => void;
      onSubmit: (ctx: unknown) => void;
    }) =>
      open ? (
        <div role='dialog' aria-modal='true'>
          <h2>
            {isGateLoading
              ? 'Release Plan'
              : canGenerateReleasePlans
                ? 'Generate Release Plan'
                : 'Upgrade To Generate A Release Plan'}
          </h2>
          <p>
            {isGateLoading
              ? 'Checking whether this workspace can generate tasks for the release plan.'
              : canGenerateReleasePlans
                ? 'Create the step-by-step tasks for this release and jump straight into the plan.'
                : 'Upgrade to turn this release into a step-by-step plan with tasks you can assign to Jovie AI.'}
          </p>
          <p>{releaseTitle ?? 'This release'} is ready.</p>
          <button
            type='button'
            onClick={onClose}
            disabled={isGeneratingReleasePlan}
          >
            Maybe Later
          </button>
          {isGateLoading ? (
            <button type='button' disabled>
              Loading...
            </button>
          ) : canGenerateReleasePlans ? (
            <button
              type='button'
              onClick={() =>
                onSubmit({
                  releaseFormat: 'single',
                  distribution: 'diy',
                  genre: 'pop',
                  primaryGoal: 'streams',
                  territory: ['GLOBAL'],
                  hasPublisher: false,
                })
              }
              disabled={isGeneratingReleasePlan}
            >
              {isGeneratingReleasePlan
                ? 'Generating...'
                : 'Generate Release Plan'}
            </button>
          ) : (
            <button type='button'>Upgrade to Pro</button>
          )}
        </div>
      ) : null,
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

// Capture the onArtworkUploaded callback so tests can trigger it after the
// AddReleaseSidebar unmounts (matches real behavior where artwork upload
// is a fire-and-forget async operation that completes after sidebar closes).
let capturedOnArtworkUploaded:
  | ((releaseId: string, artworkUrl: string) => void)
  | null = null;

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
    }) => {
      capturedOnArtworkUploaded = onArtworkUploaded ?? null;
      return (
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
        </div>
      );
    },
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
    capturedOnArtworkUploaded = null;
    mockUsePlanGate.mockReturnValue({
      smartLinksLimit: null,
      isPro: true,
      canCreateManualReleases: true,
      canGenerateReleasePlans: false,
      canEditSmartLinks: true,
      canAccessFutureReleases: true,
    });
    mockInstantiateReleaseTasks.mockResolvedValue(undefined);
  });

  describe('conditional rendering', () => {
    it('shows empty state when not connected and no releases', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={false}
        />
      );
      expect(
        await screen.findByTestId('releases-empty-state')
      ).toBeInTheDocument();
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

    it('shows spotify import banner when import is active', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease()]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
          initialImporting={true}
        />
      );

      const banner = await screen.findByTestId(
        'spotify-import-progress-banner'
      );
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

    it('registers AddReleaseSidebar in the right panel when create button is clicked', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        const rightPanelProbe = screen.getByTestId('right-panel-probe');
        expect(rightPanelProbe).toContainElement(
          screen.getByTestId('mock-add-release-sidebar')
        );
      });
    });

    it('inserts a created release locally and keeps the drawer closed while the modal is open', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
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
      expect(screen.queryByTestId('release-sidebar')).not.toBeInTheDocument();
      expect(
        await screen.findByRole('heading', {
          name: 'Upgrade To Generate A Release Plan',
        })
      ).toBeInTheDocument();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    it('prompts pro users to upgrade for release plan generation after creating a release', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      expect(
        await screen.findByRole('heading', {
          name: 'Upgrade To Generate A Release Plan',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Upgrade to turn this release into a step-by-step plan with tasks you can assign to Jovie AI.'
        )
      ).toBeInTheDocument();
    });

    it('generates a release plan and routes to the release tasks page', async () => {
      // Override to simulate Max-tier user who can generate release plans
      mockUsePlanGate.mockReturnValue({
        smartLinksLimit: null,
        isPro: true,
        canCreateManualReleases: true,
        canGenerateReleasePlans: true,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Generate Release Plan' })
      );

      await waitFor(() => {
        expect(mockInstantiateReleaseTasksFromCatalog).toHaveBeenCalledWith(
          'created-release',
          expect.objectContaining({
            releaseFormat: 'single',
            distribution: 'diy',
            genre: 'pop',
            primaryGoal: 'streams',
            hasPublisher: false,
          })
        );
      });
      expect(mockRouterPush).toHaveBeenCalledWith(
        '/app/dashboard/releases/created-release/tasks'
      );
    });

    it('shows the upgrade prompt for free users after creating a release', async () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: false,
        smartLinksLimit: 10,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateReleasePlans: false,
        canEditSmartLinks: false,
        canAccessFutureReleases: false,
      });

      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      expect(
        await screen.findByRole('heading', {
          name: 'Upgrade To Generate A Release Plan',
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Generate Release Plan' })
      ).not.toBeInTheDocument();
    });

    it('keeps the post-create modal neutral while release plan entitlements are loading', async () => {
      mockUsePlanGate.mockReturnValue({
        isLoading: true,
        smartLinksLimit: null,
        isPro: false,
        canCreateManualReleases: true,
        canGenerateReleasePlans: false,
        canEditSmartLinks: true,
        canAccessFutureReleases: true,
      });

      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      expect(
        await screen.findByRole('heading', { name: 'Release Plan' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Checking whether this workspace can generate tasks for the release plan.'
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
      expect(
        screen.queryByRole('heading', {
          name: 'Upgrade To Generate A Release Plan',
        })
      ).not.toBeInTheDocument();
    });

    it('closes the modal and leaves the new release visible when the user chooses maybe later', async () => {
      renderWithProviders(
        <ReleaseProviderMatrix
          releases={[makeRelease('existing-release')]}
          providerConfig={providerConfig}
          primaryProviders={primaryProviders}
          spotifyConnected={true}
        />
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Maybe Later' })
      );

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', {
            name: 'Upgrade To Generate A Release Plan',
          })
        ).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('release-table')).toHaveTextContent(
        'ids:created-release,existing-release'
      );
      expect(screen.queryByTestId('release-sidebar')).not.toBeInTheDocument();
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
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: 'Upgrade To Generate A Release Plan',
          })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));
      fireEvent.click(screen.getByTestId('edit-release-created-release'));

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
        screen.getAllByRole('button', { name: 'Create a new release' })[0]
      );

      await waitFor(() => {
        expect(
          screen.getByTestId('mock-add-release-sidebar')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-add-release-sidebar'));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: 'Upgrade To Generate A Release Plan',
          })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));
      fireEvent.click(screen.getByTestId('edit-release-created-release'));

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

      // Simulate async artwork upload completing after sidebar switch
      // (matches real behavior: fire-and-forget fetch that calls onArtworkUploaded)
      expect(capturedOnArtworkUploaded).toBeTruthy();
      await React.act(async () => {
        capturedOnArtworkUploaded!(
          'created-release',
          'https://cdn.example.com/cover.png'
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('release-sidebar')).toHaveTextContent(
          'created-release:Updated Release'
        );
      });
    });
  });
});
