import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { resetDashboardNavTestMocks } from '@/tests/utils/dashboard-nav-test-support';

const unifiedPathnameMock = vi.hoisted(() => vi.fn(() => '/app'));

vi.mock('next/navigation', () => ({
  usePathname: () => unifiedPathnameMock(),
  useParams: () => ({}),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

const electronRuntimeMock = vi.hoisted(() => ({
  isElectronRuntime: true,
}));

const signOutMock = vi.hoisted(() => vi.fn());
const userButtonPropsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () =>
    document.documentElement.dataset.desktopRuntime === 'electron' ||
    electronRuntimeMock.isElectronRuntime,
  useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

vi.mock('@/features/dashboard/dashboard-nav', () => ({
  DashboardNav: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid='dashboard-nav'>{children}</div>
  ),
}));

vi.mock('@/components/shell/HeaderSearchSurfaceFromContext', () => ({
  HeaderSearchSurfaceFromContext: () => (
    <button type='button'>Search Sidebar</button>
  ),
}));

vi.mock('@/components/organisms/user-button', () => ({
  UserButton: (props: { readonly showUserInfo?: boolean }) => {
    userButtonPropsMock(props);
    return <div data-testid='user-button' />;
  },
}));

vi.mock('@/features/feedback/SidebarUpgradeBanner', () => ({
  SidebarUpgradeBanner: () => <div data-testid='sidebar-upgrade-banner' />,
}));

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: () => (
    <button type='button' data-testid='update-available-pill'>
      Update
    </button>
  ),
}));

vi.mock('@/features/feedback/SidebarInstallBanner', () => ({
  SidebarInstallBanner: () => <div data-testid='sidebar-install-banner' />,
}));

vi.mock('@/components/organisms/SidebarBottomNowPlayingBridge', () => ({
  SidebarBottomNowPlayingBridge: () => null,
}));

const dashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile_123',
      avatarUrl: null,
      displayName: 'Tim White',
      username: 'timwhite',
      usernameNormalized: 'timwhite',
    } as DashboardData['creatorProfiles'][number],
  ],
  selectedProfile: {
    id: 'profile_123',
    avatarUrl: null,
    displayName: 'Tim White',
    username: 'timwhite',
    usernameNormalized: 'timwhite',
  } as DashboardData['selectedProfile'],
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
  pathname = APP_ROUTES.LIBRARY,
  section = 'library',
  isAdmin = false,
  variant,
}: {
  readonly overrideContent?: ReactNode;
  readonly pathname?: string;
  readonly section?: 'admin' | 'dashboard' | 'library' | 'ov' | 'settings';
  readonly isAdmin?: boolean;
  readonly variant?: 'jovie' | 'ov';
} = {}) {
  unifiedPathnameMock.mockReturnValue(pathname);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={{ ...dashboardData, isAdmin }}>
          <TooltipProvider>
            <SidebarProvider>
              <ShellSidebarOverrideProvider>
                {overrideContent ? (
                  <LibrarySidebarOverride>
                    {overrideContent}
                  </LibrarySidebarOverride>
                ) : null}
                <UnifiedSidebar section={section} variant={variant} />
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
    document.documentElement.removeAttribute('data-desktop-runtime');
    signOutMock.mockReset();
    userButtonPropsMock.mockReset();
    resetDashboardNavTestMocks();
    unifiedPathnameMock.mockReset();
    unifiedPathnameMock.mockReturnValue(APP_ROUTES.CHAT);
  });

  it('keeps the standard dashboard navigation on the library route', () => {
    renderUnifiedSidebar();

    expect(screen.queryByText('Loading Library')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-nav')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search Sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Back to App' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(userButtonPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ showUserInfo: true })
    );
    const panel = screen.getByTestId('sidebar-user-panel');
    expect(panel.tagName).toBe('FIELDSET');
    expect(panel).toHaveAccessibleName('Creator Identity');
    expect(
      screen.getAllByRole('group', { name: 'Creator Identity' })
    ).toHaveLength(1);
    expect(panel).toContainElement(screen.getByTestId('user-button'));
    expect(
      within(panel).getByRole('link', { name: /Public Profile/i })
    ).toHaveAttribute('href', '/timwhite');
    expect(panel).toHaveTextContent('jov.ie/timwhite');
    expect(screen.queryByText('Public Profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-upgrade-banner')).toBeNull();

    const update = screen.getByTestId('update-available-pill');
    expect(screen.getByTestId('sidebar-notifications')).toContainElement(
      update
    );
    expect(update.closest('[data-sidebar="content"]')).not.toBeNull();
    expect(update.closest('[data-sidebar="footer"]')).toBeNull();
  });

  it('mounts the desktop update listener before the runtime effect resolves', () => {
    electronRuntimeMock.isElectronRuntime = false;
    document.documentElement.dataset.desktopRuntime = 'electron';

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    // The runtime hook is intentionally still false on this first render,
    // but the synchronous bridge check must mount the pill now so a one-shot
    // Electron update event emitted during boot cannot be missed.
    expect(screen.getByTestId('update-available-pill')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-notifications')).toContainElement(
      screen.getByTestId('update-available-pill')
    );

    document.documentElement.removeAttribute('data-desktop-runtime');
  });

  it('keeps the unified user panel available on settings routes', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.SETTINGS,
      section: 'settings',
    });

    const panel = screen.getByTestId('sidebar-user-panel');
    expect(panel).toContainElement(screen.getByTestId('user-button'));
    expect(
      within(panel).getByRole('link', { name: /Public Profile/i })
    ).toHaveAttribute('href', '/timwhite');
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

  it('uses existing subtle border token without growing --linear-* namespace', () => {
    const linearTokens = readFileSync(
      join(__dirname, '../../../..', 'styles/linear-tokens.css'),
      'utf8'
    );
    const designSystem = readFileSync(
      join(__dirname, '../../../..', 'styles/design-system.css'),
      'utf8'
    );

    expect(linearTokens).toMatch(
      /--linear-border-subtle:\s*rgba\(0, 0, 0, 0\.06\);/
    );
    // --app-shell-frame-seam was retired from linear-tokens.css to
    // design-system.css (JOV-5466); assert canonical location.
    expect(designSystem).toMatch(
      /--app-shell-frame-seam:\s*rgba\(0, 0, 0, 0\.045\);/
    );
    expect(linearTokens).toMatch(
      /:root\.dark[\s\S]*--linear-border-subtle:\s*rgba\(168, 176, 195, 0\.1\);/
    );
    expect(designSystem).toMatch(
      /:root\.dark[\s\S]*--app-shell-frame-seam:\s*rgba\(168, 176, 195, 0\.1\);/
    );
    expect(linearTokens).not.toMatch(/--linear-border-divider-subtle/);
    // The retired token must not reappear in the linear namespace.
    expect(linearTokens).not.toMatch(/--linear-app-frame-seam/);
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
    expect(screen.getByRole('link', { name: 'Back to App' })).toHaveClass(
      'focus-ring-themed'
    );
    expect(
      screen.queryByRole('button', { name: 'Search Sidebar' })
    ).not.toBeInTheDocument();
  });

  it('omits header New Conversation and the web collapse control in Electron dashboard mode', () => {
    renderUnifiedSidebar({
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

  it('turns the logo into a workspace selector for admins', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
      isAdmin: true,
    });

    expect(
      screen.getByRole('button', { name: 'Switch Workspace' })
    ).toHaveTextContent('Jovie');
  });

  it('does not expose the workspace selector to non-admins', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
      isAdmin: false,
    });

    expect(
      screen.queryByRole('button', { name: 'Switch Workspace' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Jovie', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows OV as the active admin workspace without changing header height', () => {
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.OV,
      section: 'ov',
      isAdmin: true,
      variant: 'ov',
    });

    const trigger = screen.getByRole('button', { name: 'Switch Workspace' });
    expect(trigger).toHaveTextContent('OV');
    expect(trigger).toHaveClass('h-7');
    expect(container.querySelector('[data-brand-variant="ov"]')).not.toBeNull();
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
    expect(
      screen.queryByRole('button', { name: 'Search Sidebar' })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign Out' })
    ).toBeInTheDocument();
  });

  it('marks only the exact Ops destination current', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPS,
      section: 'ov',
    });

    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Chat' })
    ).not.toHaveAttribute('aria-current');
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Ops' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      operatorNavigation.querySelectorAll('[aria-current="page"]')
    ).toHaveLength(1);
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
