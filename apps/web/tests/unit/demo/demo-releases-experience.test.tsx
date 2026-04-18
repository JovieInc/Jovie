import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';

// Mock Clerk's useUser hook (pulled in transitively via DemoAuthShell → UnifiedSidebar → UserButton)
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
  useAuth: () => ({ isSignedIn: false, userId: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: undefined,
    setActive: vi.fn(),
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock nuqs sort params hook (avoids deep next/navigation dependency via nuqs → useRouter)
vi.mock('@/lib/nuqs/hooks', () => ({
  useReleaseSortParams: () => [{ sort: 'release', direction: 'desc' }, vi.fn()],
  useAudienceSortParams: () => [
    { sort: 'createdAt', direction: 'desc' },
    vi.fn(),
  ],
}));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/demo/releases',
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

const runDemoAction = vi.fn(() => Promise.resolve());

vi.mock('@/features/demo/demo-actions', () => ({
  runDemoAction,
}));

// Mock next/image for test environment
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const {
      priority: _priority,
      fetchPriority: _fp,
      unoptimized: _unoptimized,
      ...rest
    } = props;
    return <img alt='' {...rest} />;
  },
}));

// ─── Drizzle cycle prevention ────────────────────────────────────────────────
// The worktree installs its own copy of drizzle-orm under a different real-path
// than the monorepo root copy. When Node v22+ resolves the module graph it sees
// two distinct module identities for drizzle-orm and, combined with the
// profiles ↔ waitlist mutual FK cycle that drizzle schema files use, throws
// ERR_REQUIRE_CYCLE_MODULE. We break the cycle by short-circuiting every
// 'use server' action file that directly imports drizzle-orm before the
// component tree is evaluated.
vi.mock('@/app/app/(shell)/dashboard/actions/dashboard-data', () => ({
  getDashboardData: vi.fn(),
  getDashboardDataFresh: vi.fn(),
  getDashboardDataCached: vi.fn(),
  prefetchDashboardData: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: vi.fn(),
  getDashboardDataFresh: vi.fn(),
  getDashboardDataCached: vi.fn(),
  prefetchDashboardData: vi.fn(),
}));

// releases/actions.ts is imported by ReleaseProviderMatrix (via column-renderers
// → AvailabilityCell) and directly imports drizzle-orm — mock it to stop the
// schema evaluation chain.
vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  connectSpotifyArtist: vi.fn(),
  getSpotifyImportPollSnapshot: vi.fn(),
  connectAppleMusicArtist: vi.fn(),
  rescanAppleMusicLinks: vi.fn(),
  rescanIsrcLinks: vi.fn(),
  revertReleaseArtwork: vi.fn(),
  refreshRelease: vi.fn(),
  getReleases: vi.fn(),
  loadReleaseMatrix: vi.fn(),
  deleteRelease: vi.fn(),
  createRelease: vi.fn(),
  updateRelease: vi.fn(),
  saveProviderOverride: vi.fn(),
  resetProviderOverride: vi.fn(),
  saveCanvasStatus: vi.fn(),
  savePrimaryIsrc: vi.fn(),
  saveReleaseLyrics: vi.fn(),
  saveReleaseMetadata: vi.fn(),
  saveReleaseTargetPlaylists: vi.fn(),
  formatReleaseLyrics: vi.fn(),
  updateAllowArtworkDownloads: vi.fn(),
  syncFromSpotify: vi.fn(),
  importSpotifyReleases: vi.fn(),
}));

// tour-dates/actions.ts is also a 'use server' file that imports drizzle-orm.
vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  getTourDates: vi.fn(),
  createTourDate: vi.fn(),
  updateTourDate: vi.fn(),
  deleteTourDate: vi.fn(),
}));

// Stub DashboardDataContext so it never imports from the barrel.
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({
    children,
  }: {
    value: unknown;
    children: React.ReactNode;
  }) => <>{children}</>,
  useDashboardData: () => ({
    user: null,
    creatorProfiles: [],
    selectedProfile: null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
    tippingStats: {
      tipClicks: 0,
      qrTipClicks: 0,
      linkTipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: {
      percentage: 0,
      completedCount: 0,
      totalCount: 4,
      steps: [],
      profileIsLive: false,
    },
  }),
}));

const { DemoReleasesExperience } = await import(
  '@/features/demo/DemoReleasesExperience'
);

function renderDemo() {
  return render(
    <NuqsTestingAdapter>
      <DemoReleasesExperience />
    </NuqsTestingAdapter>
  );
}

function hasTextContent(text: string) {
  return (_content: string, node: Element | null) =>
    node?.textContent?.includes(text) ?? false;
}

describe('DemoReleasesExperience', () => {
  it('renders fixture data and opens the selected release in the drawer', async () => {
    renderDemo();

    // The sidebar nav has a Releases tab and it appears in the breadcrumb
    expect(screen.getAllByText('Releases').length).toBeGreaterThan(0);

    const releasesNavLabel = screen
      .getAllByText('Releases')
      .find(node => node.closest('button'));
    expect(releasesNavLabel).toBeTruthy();
    fireEvent.click(releasesNavLabel?.closest('button') as HTMLButtonElement);

    const releasesMatrix = await screen.findByTestId('releases-matrix');
    fireEvent.click(
      within(releasesMatrix).getByRole('tab', { name: 'Releases' })
    );

    // Release titles should appear in the list
    expect(
      within(releasesMatrix).getAllByText(
        hasTextContent('Blessings featuring Clementine Douglas')
      ).length
    ).toBeGreaterThan(0);

    // Click a release row to open the detail drawer
    const releaseTitle = within(releasesMatrix).getAllByText(
      hasTextContent('Blessings featuring Clementine Douglas')
    )[0];
    fireEvent.click(
      releaseTitle.closest('tr') ?? releaseTitle.closest('td') ?? releaseTitle
    );

    // Selecting a row should surface the release details alongside the table.
    await waitFor(() => {
      expect(
        screen.getAllByText(
          hasTextContent('Blessings featuring Clementine Douglas')
        ).length
      ).toBeGreaterThan(1);
    });
  });

  it('renders release data in the table', async () => {
    renderDemo();

    const releasesNavLabel = screen
      .getAllByText('Releases')
      .find(node => node.closest('button'));
    expect(releasesNavLabel).toBeTruthy();
    fireEvent.click(releasesNavLabel?.closest('button') as HTMLButtonElement);

    const releasesMatrix = await screen.findByTestId('releases-matrix');
    fireEvent.click(
      within(releasesMatrix).getByRole('tab', { name: 'Releases' })
    );

    // The table should contain mock release titles
    expect(
      within(releasesMatrix).getAllByText(
        hasTextContent('Blessings featuring Clementine Douglas')
      ).length
    ).toBeGreaterThan(0);
  });
});
