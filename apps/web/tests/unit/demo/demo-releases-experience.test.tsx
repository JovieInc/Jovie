import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';

// Mock Clerk's useUser hook (pulled in transitively via DemoAuthShell → UnifiedSidebar → UserButton)
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
    sessionClaims: null,
    actor: null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    has: () => false,
    signOut: vi.fn(),
    getToken: vi.fn(async () => null),
  }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: undefined,
    setActive: vi.fn(async () => {}),
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

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const runDemoAction = vi.fn(() => Promise.resolve());

vi.mock('@/components/demo/demo-actions', () => ({
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
  getSpotifyImportStatus: vi.fn(),
  pollReleasesCount: vi.fn(),
  connectAppleMusicArtist: vi.fn(),
  rescanAppleMusicLinks: vi.fn(),
  revertReleaseArtwork: vi.fn(),
  getReleases: vi.fn(),
  deleteRelease: vi.fn(),
  updateRelease: vi.fn(),
  importSpotifyReleases: vi.fn(),
  saveProviderOverride: vi.fn(),
  resetProviderOverride: vi.fn(),
  syncFromSpotify: vi.fn(() => Promise.resolve({ success: true })),
  refreshRelease: vi.fn(() =>
    Promise.resolve({ rateLimited: false, release: undefined })
  ),
  rescanIsrcLinks: vi.fn(() =>
    Promise.resolve({ rateLimited: false, release: undefined })
  ),
  saveCanvasStatus: vi.fn(() => Promise.resolve()),
  saveReleaseLyrics: vi.fn(() => Promise.resolve()),
  formatReleaseLyrics: vi.fn(() => Promise.resolve(['demo lyrics'])),
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
  '@/components/demo/DemoReleasesExperience'
);

function renderDemo() {
  return render(
    <NuqsTestingAdapter>
      <TooltipProvider>
        <DemoReleasesExperience />
      </TooltipProvider>
    </NuqsTestingAdapter>
  );
}

describe('DemoReleasesExperience', () => {
  it('renders fixture data and opens the selected release in the drawer', async () => {
    const user = userEvent.setup();
    renderDemo();

    // The sidebar nav has a Releases tab and it appears in the breadcrumb
    expect(screen.getAllByText('Releases').length).toBeGreaterThan(0);

    // Release titles should appear in the list
    expect(screen.getAllByText('Take Me Over').length).toBeGreaterThan(0);

    // Click a release row to open the detail drawer
    await user.click(screen.getByText('Take Me Over'));
    const previewToggle = screen.getByRole('button', {
      name: 'Toggle release preview',
    });

    // Preview toggle should reflect the opened drawer state
    await waitFor(() =>
      expect(previewToggle).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('renders release data in the table', () => {
    renderDemo();

    // The table should contain mock release titles
    expect(screen.getAllByText('Take Me Over').length).toBeGreaterThan(0);
  });
});
