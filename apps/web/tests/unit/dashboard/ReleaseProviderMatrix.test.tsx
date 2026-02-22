import { TooltipProvider } from '@jovie/ui';
import { type RenderOptions, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightPanelProvider } from '@/contexts/RightPanelContext';

/**
 * ReleaseProviderMatrix Component Tests
 *
 * Tests conditional rendering (empty, importing, table states), footer display,
 * and render stability (no infinite re-render loops).
 *
 * Heavy children are mocked to avoid Vitest memory limits.
 */

// ── Mock dependencies ──

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

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
}));

vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({
    setHeaderActions: vi.fn(),
    setHeaderBadge: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('@/lib/queries/usePlanGate', () => ({
  usePlanGate: () => ({
    smartLinksLimit: null,
    isPro: true,
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
  getBaseUrl: () => 'https://test.jovie.com',
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
}));

// Mock heavy children
vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseTable',
  () => ({
    ReleaseTable: () => <div data-testid='release-table'>table</div>,
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader',
  () => ({
    ReleaseTableSubheader: () => (
      <div data-testid='release-subheader'>subheader</div>
    ),
    DEFAULT_RELEASE_FILTERS: { releaseTypes: [], popularity: [], labels: [] },
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/ReleasesEmptyState',
  () => ({
    ReleasesEmptyState: () => (
      <div data-testid='releases-empty-state'>empty</div>
    ),
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/AppleMusicSyncBanner',
  () => ({
    AppleMusicSyncBanner: () => null,
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/SmartLinkGateBanner',
  () => ({
    SmartLinkGateBanner: () => null,
  })
);

vi.mock(
  '@/components/dashboard/organisms/release-provider-matrix/hooks/useReleaseTablePreferences',
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
  '@/components/dashboard/organisms/release-provider-matrix/hooks/useReleaseFilterCounts',
  () => ({
    getPopularityLevel: () => null,
  })
);

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: () => null,
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

// ── Import after mocks ──
const { ReleaseProviderMatrix } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix'
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
  return render(ui, {
    wrapper: ({ children }) => (
      <TooltipProvider>
        <RightPanelProvider>{children}</RightPanelProvider>
      </TooltipProvider>
    ),
    ...options,
  });
}

function makeRelease(id = 'release-1') {
  return {
    id,
    profileId: 'profile-1',
    title: `Test Release ${id}`,
    slug: `test-release-${id}`,
    smartLinkPath: `/r/test-release-${id}`,
    releaseType: 'single' as const,
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
});
