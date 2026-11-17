import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Isolate auth and server actions while rendering the real demo shell,
// release list, image component and URL state through NuqsTestingAdapter.
const captureQuery = vi.hoisted(() => ({ value: '' }));

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

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/demo/releases',
    useSearchParams: () => new URLSearchParams(captureQuery.value),
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
  saveReleaseStatus: vi.fn(),
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
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  DashboardDataProvider: ({
    children,
  }: {
    value: unknown;
    children: React.ReactNode;
  }) => <>{children}</>,
  useDashboardData: () => ({
    user: null,
    creatorProfiles: [],
    identities: [],
    selectedProfile: null,
    activeIdentity: null,
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

const { DemoReleasesExperience } = await import('./DemoReleasesExperience');

// Load the lazy release drawer up front so the click test times the UI, not
// a cold module transform.
await import('@/components/organisms/release-sidebar');

const FULL_SHELL_TIMEOUT_MS = 15_000;

function renderDemo(props: Parameters<typeof DemoReleasesExperience>[0] = {}) {
  return render(
    <NuqsTestingAdapter>
      <DemoReleasesExperience {...props} />
    </NuqsTestingAdapter>
  );
}

describe('DemoReleasesExperience certificate', () => {
  afterEach(() => {
    captureQuery.value = '';
  });

  it(
    'renders the internal DJ catalog in the shell axe-clean',
    async () => {
      const { container } = renderDemo();

      const matrix = await screen.findByTestId('releases-matrix');
      expect(
        within(matrix).getAllByRole('listitem', {
          name: /I'm Not Alone Remixes/,
        }).length
      ).toBeGreaterThan(0);
      await expectNoA11yViolations(container);
    },
    FULL_SHELL_TIMEOUT_MS
  );

  it(
    'opens a release from the list with a click',
    async () => {
      const user = userEvent.setup();
      renderDemo();

      const matrix = await screen.findByTestId('releases-matrix');
      const [row] = within(matrix).getAllByRole('listitem', {
        name: /I'm Not Alone Remixes/,
      });
      expect(screen.queryByTestId('release-sidebar')).toBeNull();
      await user.click(row);
      expect(
        await screen.findByTestId(
          'release-sidebar',
          {},
          { timeout: FULL_SHELL_TIMEOUT_MS }
        )
      ).toBeInTheDocument();
    },
    FULL_SHELL_TIMEOUT_MS
  );

  it(
    'renders the founder catalog for the founder variant axe-clean',
    async () => {
      const { container } = renderDemo({ variant: 'founder' });

      await waitFor(() =>
        expect(
          document.querySelector('[data-shell-release-row]')
        ).toHaveTextContent('The Deep End')
      );
      expect(screen.queryByText("I'm Not Alone Remixes")).toBeNull();
      await expectNoA11yViolations(container);
    },
    FULL_SHELL_TIMEOUT_MS
  );
});
