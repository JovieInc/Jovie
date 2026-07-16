import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AuthShell } from '@/components/organisms/AuthShell';
import { APP_ROUTES } from '@/constants/routes';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: ({ variant }: { variant?: string }) => (
    <div data-testid='fixture-audio-player' data-variant={variant}>
      Audio Player
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => APP_ROUTES.DASHBOARD,
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  useIsElectronRuntime: () => false,
}));

vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => false,
}));

vi.mock('@/features/dashboard/dashboard-nav', () => ({
  DashboardNav: () => <nav aria-label='Dashboard navigation' />,
}));

vi.mock('@/components/organisms/user-button', () => ({
  UserButton: () => <div data-testid='fixture-user-button' />,
}));

vi.mock('@/features/feedback/SidebarUpgradeBanner', () => ({
  SidebarUpgradeBanner: () => null,
}));

vi.mock('@/features/feedback/SidebarInstallBanner', () => ({
  SidebarInstallBanner: () => null,
}));

vi.mock('@/components/organisms/SidebarBottomNowPlayingBridge', () => ({
  SidebarBottomNowPlayingBridge: () => null,
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => (
    <div data-testid='fixture-right-panel'>Right Panel Content</div>
  ),
}));

vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: ({ sidebarTrigger }: { sidebarTrigger?: ReactNode }) => (
    <header data-testid='fixture-header'>
      {sidebarTrigger}
      Dashboard Header
    </header>
  ),
}));

vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => (
    <nav data-testid='fixture-mobile-tabs'>Mobile Tabs</nav>
  ),
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

const dashboardData: DashboardData = {
  user: { id: 'user_123' },
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
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

function renderShell(designV1: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider
        initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: designV1 }}
      >
        <DashboardDataProvider value={dashboardData}>
          <TooltipProvider>
            <ShellSidebarOverrideProvider>
              <AuthShell section='dashboard' breadcrumbs={[]} showMobileTabs>
                <div>Main Content</div>
              </AuthShell>
            </ShellSidebarOverrideProvider>
          </TooltipProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}

describe('shell variant parity (legacy vs shellChatV1)', () => {
  beforeEach(() => {
    localStorage.removeItem(FF_OVERRIDES_KEY);
  });

  it.each([
    ['legacy', false],
    ['shellChatV1', true],
  ] as const)('renders all six AppShellFrame slots for the %s variant', (variantName, designV1) => {
    renderShell(designV1);

    const frame = screen
      .getByTestId('app-shell-sidebar-mount')
      .closest('[data-app-shell-frame]');
    expect(frame).toHaveAttribute('data-shell-design', variantName);

    expect(
      screen
        .getByTestId('app-shell-sidebar-mount')
        .querySelector('[data-sidebar="sidebar"]')
    ).toBeInTheDocument();

    expect(screen.getByTestId('fixture-header')).toBeInTheDocument();

    const scrollPane = screen.getByTestId('app-shell-scroll');
    expect(scrollPane).toContainElement(screen.getByText('Main Content'));

    const rightRail = screen.getByTestId('app-shell-right-rail');
    expect(rightRail).toHaveAttribute('data-shell-design', variantName);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-panel')
    );

    expect(screen.getByTestId('fixture-audio-player')).toHaveAttribute(
      'data-variant',
      variantName
    );

    expect(screen.getByTestId('fixture-mobile-tabs')).toBeInTheDocument();
  });

  it('keeps the sidebar toggle reachable in both variants (header trigger or in-sidebar collapse control)', () => {
    renderShell(false);
    expect(
      within(screen.getByTestId('fixture-header')).getByRole('button', {
        name: 'Toggle Sidebar',
      })
    ).toBeInTheDocument();
  });

  it('keeps the real UnifiedSidebar collapse control reachable when shellChatV1 is open', () => {
    renderShell(true);
    expect(
      within(screen.getByTestId('fixture-header')).queryByRole('button', {
        name: 'Toggle Sidebar',
      })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('app-shell-sidebar-mount')).getByRole(
        'button',
        { name: 'Collapse sidebar' }
      )
    ).toBeInTheDocument();
  });
});
