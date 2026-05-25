import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { APP_ROUTES } from '@/constants/routes';
import {
  ShellSidebarOverrideProvider,
  useRegisterShellSidebarOverride,
} from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import {
  mockUsePathname,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

const electronRuntimeMock = vi.hoisted(() => ({
  isElectronRuntime: true,
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
}));

vi.mock('@/features/dashboard/dashboard-nav', () => ({
  DashboardNav: () => <div data-testid='dashboard-nav' />,
}));

vi.mock('@/components/organisms/user-button', () => ({
  UserButton: () => <div data-testid='user-button' />,
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

function LibrarySidebarOverride({
  children,
}: {
  readonly children: ReactNode;
}) {
  useRegisterShellSidebarOverride({
    key: 'library',
    backHref: APP_ROUTES.CHAT,
    backLabel: 'Back to App',
    content: (
      <nav aria-label='Library navigation'>
        <button type='button'>All Releases</button>
        {children}
      </nav>
    ),
  });

  return null;
}

function renderUnifiedSidebar({
  overrideContent,
  designV1 = true,
  pathname = APP_ROUTES.LIBRARY,
  section = 'library',
}: {
  readonly overrideContent?: ReactNode;
  readonly designV1?: boolean;
  readonly pathname?: string;
  readonly section?: 'admin' | 'dashboard' | 'library' | 'settings';
} = {}) {
  mockUsePathname.mockReturnValue(pathname);
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
            <SidebarProvider>
              <ShellSidebarOverrideProvider>
                {overrideContent ? (
                  <LibrarySidebarOverride>
                    {overrideContent}
                  </LibrarySidebarOverride>
                ) : null}
                <UnifiedSidebar section={section} />
              </ShellSidebarOverrideProvider>
            </SidebarProvider>
          </TooltipProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}

describe('UnifiedSidebar library route', () => {
  afterEach(() => {
    electronRuntimeMock.isElectronRuntime = true;
    resetDashboardNavTestMocks();
  });

  it('keeps the library route out of the default dashboard navigation', () => {
    renderUnifiedSidebar();

    expect(screen.queryByText('Loading Library')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to App' })).toBeDefined();
    expect(
      screen.queryByRole('navigation', { name: 'Library navigation' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Releases' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Tasks' })
    ).not.toBeInTheDocument();
  });

  it('renders the registered library navigation with the app back target', async () => {
    renderUnifiedSidebar({
      overrideContent: <button type='button'>Needs Assets</button>,
    });

    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: 'Library navigation' })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'All Releases' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Needs Assets' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading Library')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to App' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
  });

  it('omits header New thread and the web collapse control in Electron dashboard mode', () => {
    renderUnifiedSidebar({
      designV1: false,
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(screen.getByText('Jovie', { selector: 'span' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New thread' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' })
    ).not.toBeInTheDocument();
  });

  it('uses the in-sidebar collapse control as the web dashboard toggle', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New thread' })
    ).not.toBeInTheDocument();
  });
});
