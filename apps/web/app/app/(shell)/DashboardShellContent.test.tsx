import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  getFreshAuth: vi.fn(),
  privacyState: vi.fn(),
  dashboard: vi.fn(),
  shellDashboard: vi.fn(),
  flags: vi.fn(),
  dehydrated: vi.fn(),
  essential: vi.fn(),
  captureError: vi.fn(),
  banStatus: vi.fn(),
  banned: false,
  boundaryMounts: 0,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/components/UnavailablePage', () => ({
  UnavailablePage: () => (
    <main>
      <h1>Unavailable</h1>
    </main>
  ),
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
  getUserBanStatus: mocks.banStatus,
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.getFreshAuth }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
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
    dashboardData,
    unlockedShellChrome,
  }: {
    children: React.ReactNode;
    initiallyLocked: boolean;
    dashboardData: unknown;
    unlockedShellChrome?: React.ReactNode;
  }) => {
    const [locked] = useState(initiallyLocked);
    const [mountId] = useState(() => ++mocks.boundaryMounts);
    if (!dashboardData && !locked) return null;
    return (
      <div
        data-boundary-mount={mountId}
        data-has-chrome={String(Boolean(unlockedShellChrome))}
        data-has-children={String(Boolean(children))}
        data-initially-locked={String(initiallyLocked)}
        data-effective-locked={String(locked)}
      >
        {locked ? <div>Unlock Ovie</div> : children}
      </div>
    );
  },
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
  shouldDefaultOpenShellPreview: (
    pathname: string | null,
    useEssentialShell: boolean
  ) =>
    !useEssentialShell ||
    pathname === '/app/settings/profile' ||
    Boolean(pathname?.startsWith('/app/settings/profile/')),
}));

import { DashboardShellContent } from './DashboardShellContent';

const shell = (
  mode: 'ov' | 'customer',
  child: React.ReactNode,
  pathname = '/app'
) =>
  DashboardShellContent({ userId: 'user-1', pathname, mode, children: child });

const ovieState = (enabled: boolean, locked: boolean) => {
  mocks.getFreshAuth.mockResolvedValue({
    userId: 'user-1',
    sessionId: 'session-1',
  });
  mocks.privacyState.mockResolvedValue({
    enabled,
    locked,
    unlockedUntil: null,
  });
};

const boundaryMount = () =>
  document
    .querySelector('[data-boundary-mount]')
    ?.getAttribute('data-boundary-mount');

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
    mocks.boundaryMounts = 0;
    mocks.banned = false;
    mocks.banStatus
      .mockReset()
      .mockImplementation(async () => ({ isBanned: mocks.banned }));
    mocks.shellDashboard.mockReset().mockResolvedValue(dashboardData);
    mocks.dashboard.mockReset().mockResolvedValue(dashboardData);
    mocks.flags.mockResolvedValue({});
    mocks.dehydrated.mockReturnValue({ private: 'cache' });
    mocks.essential.mockReturnValue(true);
  });

  it.each(['shell data', 'full data', 'flags'])(
    'shows an error instead of holding the page behind the shell skeleton when %s stalls',
    async stalledRead => {
      vi.useFakeTimers();
      try {
        mocks.essential.mockReturnValue(stalledRead !== 'full data');
        const stalledMock =
          stalledRead === 'flags'
            ? mocks.flags
            : stalledRead === 'full data'
              ? mocks.dashboard
              : mocks.shellDashboard;
        stalledMock.mockReturnValue(new Promise(() => {}));
        let result: React.ReactNode;
        const pending = shell(
          'customer',
          <div>Contacts page</div>,
          '/app/contacts'
        ).then(tree => {
          result = tree;
        });
        await vi.advanceTimersByTimeAsync(10_001);
        expect(result).toBeDefined();
        await pending;
        render(result);

        expect(screen.getByRole('alert')).toHaveTextContent(
          'Failed to load your workspace. Please refresh the page.'
        );
        expect(screen.queryByText('Contacts page')).not.toBeInTheDocument();
        expect(stalledMock).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('preserves a dashboard authentication redirect', async () => {
    const redirect = Object.assign(new Error('redirect'), {
      digest: 'NEXT_REDIRECT;replace;/signin;307;',
    });
    mocks.shellDashboard.mockRejectedValue(redirect);
    await expect(
      shell('customer', <div>Contacts page</div>, '/app/contacts')
    ).rejects.toBe(redirect);
  });

  it('does not invoke dashboard data or serialize child pages while Ovie is locked', async () => {
    ovieState(true, true);
    const tree = await shell('ov', <div>Private route child</div>);

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
    ovieState(false, false);
    mocks.dashboard.mockResolvedValue(dashboardData);
    const tree = await shell('ov', <div>Ovie dashboard</div>);

    render(tree);
    expect(screen.getByText('Ovie dashboard')).toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.dehydrated).toHaveBeenCalledOnce();
  });

  it('never queries Ovie privacy for the ordinary Jovie shell', async () => {
    mocks.shellDashboard.mockResolvedValue(dashboardData);
    const tree = await shell('customer', <div>Jovie dashboard</div>);

    render(tree);
    expect(screen.getByText('Jovie dashboard')).toBeInTheDocument();
    expect(mocks.privacyState).not.toHaveBeenCalled();
    expect(mocks.getFreshAuth).not.toHaveBeenCalled();
  });

  it('reinitializes the privacy boundary on warm Jovie to locked Ovie navigation', async () => {
    mocks.shellDashboard.mockResolvedValue(dashboardData);
    const jovieTree = await shell('customer', <div>Jovie dashboard</div>);
    const view = render(jovieTree);
    const jovieMount = boundaryMount();
    expect(screen.getByText('Jovie dashboard')).toBeInTheDocument();

    ovieState(true, true);
    const ovieTree = await shell('ov', <div>Private Ovie dashboard</div>);
    view.rerender(ovieTree);

    expect(screen.getByText('Unlock Ovie')).toBeInTheDocument();
    expect(screen.queryByText('Jovie dashboard')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Private Ovie dashboard')
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-effective-locked="true"]')
    ).toBeTruthy();
    expect(boundaryMount()).not.toBe(jovieMount);
  });

  it('keeps the privacy boundary mounted across ordinary route changes', async () => {
    mocks.shellDashboard.mockResolvedValue(dashboardData);
    const firstTree = await shell('customer', <div>Dashboard route</div>);
    const view = render(firstTree);
    const initialMount = boundaryMount();

    const nextTree = await shell(
      'customer',
      <div>Settings route</div>,
      '/app/settings'
    );
    view.rerender(nextTree);

    expect(screen.getByText('Settings route')).toBeInTheDocument();
    expect(boundaryMount()).toBe(initialMount);
  });

  it('renders the workspace error state accessibly when the shell read fails', async () => {
    mocks.shellDashboard.mockRejectedValue(new Error('DAL unavailable'));
    const { container } = render(
      await shell('customer', <div>Contacts page</div>, '/app/contacts')
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load your workspace. Please refresh the page.'
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(mocks.captureError).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('shows a banned account only the unavailable page, axe-clean', async () => {
    mocks.banned = true;
    const { container } = render(
      await shell('customer', <div>Private route child</div>)
    );

    expect(
      screen.getByRole('heading', { name: 'Unavailable' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Private route child')).not.toBeInTheDocument();
    expect(mocks.banStatus).toHaveBeenCalledWith('user-1');
    expect(mocks.dehydrated).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('starts the workspace read while the ban check is still pending', async () => {
    let resolveBan: (status: { isBanned: boolean }) => void = () => {};
    mocks.banStatus.mockReturnValue(
      new Promise<{ isBanned: boolean }>(resolve => {
        resolveBan = resolve;
      })
    );
    let tree: React.ReactNode;
    const pending = shell('customer', <div>Jovie dashboard</div>).then(
      result => {
        tree = result;
      }
    );

    await vi.waitFor(() => {
      expect(mocks.shellDashboard).toHaveBeenCalledOnce();
      expect(mocks.flags).toHaveBeenCalledOnce();
    });
    // Workspace data has resolved, but nothing renders without a ban verdict.
    await Promise.resolve();
    expect(tree).toBeUndefined();

    resolveBan({ isBanned: false });
    await pending;
    render(tree);
    expect(screen.getByText('Jovie dashboard')).toBeInTheDocument();
  });

  it('blocks a banned account even when workspace data resolved first', async () => {
    let resolveBan: (status: { isBanned: boolean }) => void = () => {};
    mocks.banStatus.mockReturnValue(
      new Promise<{ isBanned: boolean }>(resolve => {
        resolveBan = resolve;
      })
    );
    const pending = shell('customer', <div>Private route child</div>);
    await vi.waitFor(() => expect(mocks.shellDashboard).toHaveBeenCalledOnce());
    await mocks.shellDashboard.mock.results[0]?.value;

    resolveBan({ isBanned: true });
    render(await pending);

    expect(
      screen.getByRole('heading', { name: 'Unavailable' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Private route child')).not.toBeInTheDocument();
    expect(mocks.dehydrated).not.toHaveBeenCalled();
  });

  it.each([
    [
      'redirects',
      Object.assign(new Error('redirect'), {
        digest: 'NEXT_REDIRECT;replace;/start;307;',
      }),
    ],
    ['fails', new Error('DAL unavailable')],
  ])(
    'keeps a banned account on the unavailable page when the workspace read %s',
    async (_label, failure) => {
      mocks.banned = true;
      mocks.shellDashboard.mockRejectedValue(failure);

      render(await shell('customer', <div>Private route child</div>));

      expect(
        screen.getByRole('heading', { name: 'Unavailable' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mocks.captureError).not.toHaveBeenCalled();
    }
  );

  it('renders nothing when the ban check itself fails', async () => {
    const failure = new Error('ban check unavailable');
    mocks.banStatus.mockRejectedValue(failure);

    await expect(
      shell('customer', <div>Private route child</div>)
    ).rejects.toBe(failure);
    expect(mocks.dehydrated).not.toHaveBeenCalled();
  });

  it('blocks a banned Ovie account without rendering the workspace', async () => {
    mocks.banned = true;
    mocks.essential.mockReturnValue(false);
    ovieState(false, false);

    render(await shell('ov', <div>Private Ovie dashboard</div>));

    expect(
      screen.getByRole('heading', { name: 'Unavailable' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Private Ovie dashboard')
    ).not.toBeInTheDocument();
  });

  it.each([
    ['unlocked Jovie shell', 'customer', false],
    ['locked Ovie shell', 'ov', true],
  ] as const)('keeps the %s axe-clean', async (_label, mode, locked) => {
    if (mode === 'ov') ovieState(true, locked);
    const { container } = render(await shell(mode, <main>Route content</main>));

    expect(
      screen.queryByText(locked ? 'Route content' : 'Unlock Ovie')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
