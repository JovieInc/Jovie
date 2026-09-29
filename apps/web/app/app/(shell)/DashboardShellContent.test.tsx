import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFreshAuth: vi.fn(),
  privacyState: vi.fn(),
  dashboard: vi.fn(),
  shellDashboard: vi.fn(),
  flags: vi.fn(),
  dehydrated: vi.fn(),
  essential: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/components/UnavailablePage', () => ({
  UnavailablePage: () => <div>Unavailable</div>,
}));
vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/components/organisms/OperatorBannerWrapper', () => ({
  OperatorBannerWrapper: () => null,
}));
vi.mock('@/features/admin/OperatorBannerWrapper', () => ({
  OperatorBannerWrapper: () => null,
}));
vi.mock('@/features/admin/ImpersonationBannerWrapper', () => ({
  ImpersonationBannerWrapper: () => null,
}));
vi.mock('@/features/workspace-lock/WorkspaceLockScreen', () => ({
  WorkspaceLockScreen: () => <div>Unlock Ovie</div>,
}));
vi.mock('@/lib/auth/ban-check', () => ({
  getUserBanStatus: async () => ({ isBanned: false }),
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.getFreshAuth }));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  getOviePrivacyLockState: mocks.privacyState,
}));
vi.mock('@/lib/app-shell/workspaces', () => ({
  shouldRenderOperatorChrome: () => true,
}));
vi.mock('@/lib/flags/client', () => ({
  AppFlagProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/lib/flags/route-snapshots', () => ({
  resolveAppShellRouteFlagNames: () => [],
}));
vi.mock('@/lib/flags/server', () => ({
  getAppFlagsSnapshot: mocks.flags,
}));
vi.mock('@/lib/queries', () => ({
  HydrateClient: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/lib/queries/server', () => ({
  getDehydratedState: mocks.dehydrated,
}));
vi.mock('@/lib/workspace-lock/money-visibility', () => ({
  MoneyVisibilityProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/lib/workspace-lock/workspace-lock', () => ({
  isMoneyHiddenCookieValue: () => false,
  MONEY_HIDDEN_COOKIE: 'money',
}));
vi.mock('./DashboardLoadTracker', () => ({ DashboardLoadTracker: () => null }));
vi.mock('./DashboardShellPrivacyBoundary', () => ({
  DashboardShellPrivacyBoundary: ({
    children,
    initiallyLocked,
    unlockedShellChrome,
  }: {
    children: React.ReactNode;
    initiallyLocked: boolean;
    unlockedShellChrome?: React.ReactNode;
  }) => (
    <div
      data-has-chrome={String(Boolean(unlockedShellChrome))}
      data-has-children={String(Boolean(children))}
      data-initially-locked={String(initiallyLocked)}
    >
      {initiallyLocked ? <div>Unlock Ovie</div> : children}
    </div>
  ),
}));
vi.mock('./dashboard/actions', () => ({
  getDashboardData: mocks.dashboard,
  getDashboardShellData: mocks.shellDashboard,
  setSidebarCollapsed: vi.fn(),
}));
vi.mock('./ProfileCompletionRedirect', () => ({
  ProfileCompletionRedirect: () => null,
}));
vi.mock('./shell-route-matches', () => ({
  shouldRedirectToOnboarding: () => false,
  shouldUseEssentialShellData: mocks.essential,
}));

import { DashboardShellContent } from './DashboardShellContent';

const dashboardData = {
  user: { id: 'user-1' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: true,
  tippingStats: { totalTips: 0, totalAmount: 0, recentTips: [] },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
};

describe('DashboardShellContent privacy decision', () => {
  afterEach(() => vi.clearAllMocks());
  beforeEach(() => {
    mocks.flags.mockResolvedValue({});
    mocks.dehydrated.mockReturnValue({ private: 'cache' });
    mocks.essential.mockReturnValue(true);
  });

  it('does not invoke dashboard data or serialize child pages while Ovie is locked', async () => {
    mocks.getFreshAuth.mockResolvedValue({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    mocks.privacyState.mockResolvedValue({
      enabled: true,
      locked: true,
      unlockedUntil: null,
    });
    const tree = await DashboardShellContent({
      userId: 'user-1',
      pathname: '/app',
      mode: 'ov',
      children: <div>Private route child</div>,
    });

    render(tree);
    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Private route child')).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-initially-locked="true"]')
    ).toHaveAttribute('data-has-children', 'false');
    expect(
      document.querySelector('[data-initially-locked="true"]')
    ).toHaveAttribute('data-has-chrome', 'false');
    expect(mocks.dehydrated).not.toHaveBeenCalled();
    expect(mocks.shellDashboard).not.toHaveBeenCalled();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.flags).not.toHaveBeenCalled();
  });

  it('keeps disabled Ovie privacy usable without consulting the legacy step-up state', async () => {
    mocks.essential.mockReturnValue(false);
    mocks.getFreshAuth.mockResolvedValue({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    mocks.privacyState.mockResolvedValue({
      enabled: false,
      locked: false,
      unlockedUntil: null,
    });
    mocks.dashboard.mockResolvedValue(dashboardData);
    const tree = await DashboardShellContent({
      userId: 'user-1',
      pathname: '/app',
      mode: 'ov',
      children: <div>Ovie dashboard</div>,
    });

    render(tree);
    expect(screen.getByText('Ovie dashboard')).toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.dehydrated).toHaveBeenCalledOnce();
  });

  it('never queries Ovie privacy for the ordinary Jovie shell', async () => {
    mocks.shellDashboard.mockResolvedValue(dashboardData);
    const tree = await DashboardShellContent({
      userId: 'user-1',
      pathname: '/app',
      mode: 'customer',
      children: <div>Jovie dashboard</div>,
    });

    render(tree);
    expect(screen.getByText('Jovie dashboard')).toBeInTheDocument();
    expect(mocks.privacyState).not.toHaveBeenCalled();
    expect(mocks.getFreshAuth).not.toHaveBeenCalled();
  });
});
