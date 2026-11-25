import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import {
  electronRuntimeMock,
  nowPlayingBridgePropsMock,
  renderUnifiedSidebar,
  resetUnifiedSidebarTestState,
} from './UnifiedSidebar.test-harness';
import { dashboardData } from './unified-sidebar-dashboard-data';

vi.mock('next/link', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextLinkMock()
);

vi.mock('next/navigation', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextNavigationMock()
);

vi.mock('@/lib/desktop/electron-bridge', async importOriginal =>
  (await import('./UnifiedSidebar.mock-factories')).electronBridgeMock(
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()
  )
);

vi.mock('@/hooks/useClerkSafe', async () =>
  (await import('./UnifiedSidebar.mock-factories')).clerkSafeMock()
);

vi.mock('@/features/dashboard/dashboard-nav', async () =>
  (await import('./UnifiedSidebar.mock-factories')).dashboardNavMock()
);

vi.mock('@/components/shell/HeaderSearchSurfaceFromContext', async () =>
  (await import('./UnifiedSidebar.mock-factories')).headerSearchSurfaceMock()
);

vi.mock('@/components/organisms/user-button', async () =>
  (await import('./UnifiedSidebar.mock-factories')).userButtonMock()
);

vi.mock('@/components/organisms/SidebarDockBridge', async () =>
  (await import('./UnifiedSidebar.mock-factories')).sidebarDockBridgeMock()
);

describe('UnifiedSidebar identity and dock', () => {
  afterEach(() => {
    resetUnifiedSidebarTestState();
  });

  it('shows the identity switcher when the account has multiple identities', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
      data: {
        creatorProfiles: [
          dashboardData.creatorProfiles[0],
          {
            id: 'profile_456',
            avatarUrl: null,
            displayName: 'Second Act',
            username: 'secondact',
            usernameNormalized: 'secondact',
          } as DashboardData['creatorProfiles'][number],
        ],
      },
    });

    expect(
      screen.getByRole('button', { name: /Switch identity:/ })
    ).toBeInTheDocument();
  });

  it('hides the identity switcher for a single-identity account', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(
      screen.queryByRole('button', { name: /Switch identity:/ })
    ).not.toBeInTheDocument();
  });

  it("orders update, What's New, and now-playing in the ambient dock", () => {
    electronRuntimeMock.isElectronRuntime = false;
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    const dock = container.querySelector('[data-sidebar-dock="true"]');
    const update = screen.getByTestId('update-available-pill');
    const whatsNew = screen.getByTestId('sidebar-whats-new');
    const nowPlaying = screen.getByTestId('sidebar-now-playing-bridge');
    expect(dock).toContainElement(update);
    expect(dock).toContainElement(whatsNew);
    expect(dock).toContainElement(nowPlaying);
    expect(update.compareDocumentPosition(whatsNew)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(whatsNew.compareDocumentPosition(nowPlaying)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('tells the dock whether the viewer already claimed a handle', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });
    expect(nowPlayingBridgePropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userState: { hasClaimedHandle: true } })
    );
  });

  it('removes only the duplicate Settings account menu while preserving dock and profile access', async () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.SETTINGS,
      section: 'settings',
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    const panel = screen.getByTestId('sidebar-user-panel');
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-whats-new')).toBeInTheDocument();
    expect(
      screen.getByTestId('sidebar-now-playing-bridge')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeEnabled();
    expect(
      within(panel).getByRole('link', { name: /Public Profile/i })
    ).toHaveAttribute('href', '/timwhite');
    const settingsNav = screen.getByRole('navigation', {
      name: 'settings navigation',
    });
    for (const label of ['Personal', 'Artist']) {
      const group = within(settingsNav)
        .getAllByText(label)
        .find(node => node.className.includes('font-caption'));
      expect(group?.className).toContain('text-sidebar-muted');
      expect(group?.className).not.toMatch(/text-sidebar-muted\/\d+/);
      expect(group).toHaveClass(
        'ps-(--app-shell-sidebar-label-inset)',
        'pe-(--app-shell-sidebar-inset)'
      );
      expect(group).not.toHaveClass('px-2.5');
    }
  });

  it('keeps the unified user panel when a route-owned sidebar override replaces nav', () => {
    renderUnifiedSidebar({
      overrideContent: <span>Library-owned sidebar</span>,
      section: 'library',
    });

    expect(screen.getByText('Library-owned sidebar')).toBeInTheDocument();
    const panel = screen.getByTestId('sidebar-user-panel');
    expect(panel).toContainElement(screen.getByTestId('user-button'));
    expect(
      within(panel).getByRole('link', { name: /Public Profile/i })
    ).toHaveAttribute('href', '/timwhite');
  });
});

// JOV-8137: the completion widget persists in the sidebar on every page
// until the profile hits 100%.
describe('UnifiedSidebar profile completion widget (JOV-8137)', () => {
  const incompleteCompletion = {
    percentage: 50,
    completedCount: 2,
    totalCount: 4,
    steps: [
      {
        id: 'avatar' as const,
        label: 'Add A Profile Photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: APP_ROUTES.SETTINGS_PROFILE,
      },
    ],
    profileIsLive: false,
  };

  it('renders the completion widget while the profile is incomplete', () => {
    renderUnifiedSidebar({
      section: 'dashboard',
      data: { profileCompletion: incompleteCompletion },
    });

    expect(
      screen.getByTestId('sidebar-profile-completion')
    ).toBeInTheDocument();
  });

  it('renders no completion widget once the profile is complete', () => {
    renderUnifiedSidebar({
      section: 'dashboard',
      data: {
        profileCompletion: {
          ...incompleteCompletion,
          percentage: 100,
          completedCount: 4,
          steps: [],
          profileIsLive: true,
        },
      },
    });

    expect(
      document.querySelector('[data-testid="sidebar-profile-completion"]')
    ).toBeNull();
  });
});
