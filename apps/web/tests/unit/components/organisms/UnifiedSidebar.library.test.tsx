import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
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

const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
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
      <nav aria-label='Library filters'>
        <button type='button'>Status</button>
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
  readonly section?: 'admin' | 'dashboard' | 'library' | 'ov' | 'settings';
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
    signOutMock.mockReset();
    resetDashboardNavTestMocks();
  });

  it('keeps the standard dashboard navigation on the library route', () => {
    renderUnifiedSidebar();

    expect(screen.queryByText('Loading Library')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-nav')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Back to App' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('preserves the generic route-override contract for legitimate consumers', async () => {
    renderUnifiedSidebar({
      overrideContent: <button type='button'>Needs Assets</button>,
    });

    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: 'Library filters' })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Needs Assets' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading Library')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to App' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
  });

  it('omits header New Conversation and the web collapse control in Electron dashboard mode', () => {
    renderUnifiedSidebar({
      designV1: false,
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(screen.getByText('Jovie', { selector: 'span' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Chat' })
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
      screen.queryByRole('link', { name: 'New Chat' })
    ).not.toBeInTheDocument();
  });

  it('renders dedicated operator navigation without the customer dashboard nav', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPS,
      section: 'ov',
    });

    expect(
      screen.getByRole('navigation', { name: 'OV Navigation' })
    ).toBeInTheDocument();
    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    const operatorLinks = within(operatorNavigation).getAllByRole('link');

    expect(
      operatorLinks.map(link => ({
        label: link.textContent,
        href: link.getAttribute('href'),
      }))
    ).toEqual(
      ADMIN_NAV_REGISTRY.map(item => ({
        label: item.label,
        href: item.href,
      }))
    );
    expect(screen.queryByTestId('dashboard-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign Out' })
    ).toBeInTheDocument();
  });

  it('keeps Jovie-mode admin routes on the same customer navigation contract', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.LEGACY_ADMIN,
      section: 'admin',
    });

    expect(screen.getByTestId('dashboard-nav')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'OV Navigation' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });
});
