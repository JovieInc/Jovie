import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
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
const nowPlayingBridgePropsMock = vi.hoisted(() => vi.fn());

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

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: () => (
    <button type='button' data-testid='update-available-pill'>
      Update
    </button>
  ),
}));

vi.mock('@/components/organisms/whats-new/WhatsNewBanner', () => ({
  WhatsNewBanner: (props: {
    readonly enabled: boolean;
    readonly collapsed?: boolean;
  }) => (
    <div
      data-testid='sidebar-whats-new'
      data-enabled={String(props.enabled)}
      data-collapsed={String(Boolean(props.collapsed))}
    />
  ),
}));

vi.mock('@/components/organisms/SidebarBottomNowPlayingBridge', () => ({
  SidebarBottomNowPlayingBridge: (props: { readonly collapsed?: boolean }) => {
    nowPlayingBridgePropsMock(props);
    return <div data-testid='sidebar-now-playing-bridge' />;
  },
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

function BrowserHeaderToggle() {
  const { state } = useSidebar();
  return !electronRuntimeMock.isElectronRuntime && state === 'closed' ? (
    <SidebarCollapseButton />
  ) : null;
}

function renderUnifiedSidebar({
  overrideContent,
  pathname = APP_ROUTES.LIBRARY,
  section = 'library',
  isAdmin = false,
  variant,
  data,
  sidebarDefaultOpen = true,
}: {
  readonly overrideContent?: ReactNode;
  readonly pathname?: string;
  readonly section?: 'admin' | 'dashboard' | 'library' | 'ov' | 'settings';
  readonly isAdmin?: boolean;
  readonly variant?: 'jovie' | 'ov';
  readonly data?: Partial<DashboardData>;
  readonly sidebarDefaultOpen?: boolean;
} = {}) {
  unifiedPathnameMock.mockReturnValue(pathname);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={{ ...dashboardData, isAdmin, ...data }}>
          <TooltipProvider>
            <SidebarProvider defaultOpen={sidebarDefaultOpen}>
              <ShellSidebarOverrideProvider>
                {overrideContent ? (
                  <LibrarySidebarOverride>
                    {overrideContent}
                  </LibrarySidebarOverride>
                ) : null}
                <UnifiedSidebar
                  section={section}
                  variant={variant}
                  headerOwnsCollapsedToggle
                />
                <BrowserHeaderToggle />
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
    document.cookie = 'sidebar:state=; path=/; max-age=0';
    electronRuntimeMock.isElectronRuntime = true;
    document.documentElement.removeAttribute('data-desktop-runtime');
    signOutMock.mockReset();
    userButtonPropsMock.mockReset();
    nowPlayingBridgePropsMock.mockReset();
    resetDashboardNavTestMocks();
    unifiedPathnameMock.mockReset();
    unifiedPathnameMock.mockReturnValue(APP_ROUTES.CHAT);
  });

  it('has one accessible browser toggle with the real sidebar when restored collapsed', () => {
    electronRuntimeMock.isElectronRuntime = false;
    renderUnifiedSidebar({ sidebarDefaultOpen: false });
    expect(
      screen.getAllByRole('button', { name: 'Expand sidebar' })
    ).toHaveLength(1);
    const sidebarToggle = document.querySelector(
      '[data-shell-rail-motion="left"] [data-rail-toggle="left"]'
    );
    expect(sidebarToggle?.closest('[inert]')).not.toBeNull();
  });

  it('keeps the standard dashboard navigation on the library route', () => {
    renderUnifiedSidebar();

    expect(screen.queryByText('Loading Work')).not.toBeInTheDocument();
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
      within(panel).queryByRole('link', { name: /Public Profile/i })
    ).toBeNull();
    expect(userButtonPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ calm: true, profileHref: '/timwhite' })
    );
    expect(screen.queryByText('Public Profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-upgrade-banner')).toBeNull();
    const dock = document.querySelector('[data-sidebar-dock="true"]');
    expect(dock).toHaveClass('shrink-0');
    expect(dock).toContainElement(
      screen.getByTestId('sidebar-now-playing-bridge')
    );
    expect(nowPlayingBridgePropsMock).toHaveBeenCalledWith({
      collapsed: false,
    });
    const row = screen
      .getByRole('link', { name: /Inbox —/ })
      .closest('[data-sidebar-brand-row]');
    expect(row).toContainElement(
      screen.getByRole('button', { name: 'Search Sidebar' })
    );
    expect(screen.getByRole('link', { name: /Inbox —/ })).toHaveAttribute(
      'href',
      '/app'
    );
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
      screen.getByRole('button', { name: 'Switch Identity' })
    ).toBeInTheDocument();
  });

  it('hides the identity switcher for a single-identity account', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    expect(
      screen.queryByRole('button', { name: 'Switch Identity' })
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
    expect(whatsNew).toHaveAttribute('data-enabled', 'false');
    expect(whatsNew).toHaveAttribute('data-collapsed', 'false');
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

  it('uses the single unified header-height token for route/operator sidebar headers (founder lock 2026-09-25)', () => {
    const source = readFileSync(
      join(__dirname, '../../../..', 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(source).toContain("'h-(--app-shell-header-height) py-0.5'");
    expect(source).not.toContain(
      "'h-(--app-shell-header-height-compact) py-0.5'"
    );
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
    expect(screen.queryByText('Loading Work')).not.toBeInTheDocument();
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

    expect(
      screen.getByRole('button', { name: 'Ask Jovie' })
    ).toBeInTheDocument();
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

  it('stages browser header chrome without dropping the expanded toggle (JOV-4522)', () => {
    electronRuntimeMock.isElectronRuntime = false;

    renderUnifiedSidebar({
      pathname: APP_ROUTES.DASHBOARD,
      section: 'dashboard',
    });

    // The wrapper stages the in-sidebar control out when the main header
    // takes ownership in compact mode; the expanded control stays mounted.
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.parentElement?.className).toContain(
      'group-data-[collapsible=icon]:order-first'
    );
    expect(toggle.parentElement?.className).toContain(
      'group-data-[collapsible=icon]:mx-auto'
    );

    const brandRow = toggle.closest('[data-sidebar-brand-row]');
    expect(brandRow).not.toBeNull();
    const stagedCluster = brandRow?.querySelector(
      '[data-sidebar-header-actions]'
    );
    expect(stagedCluster).not.toBeNull();
    expect(stagedCluster?.className).toContain(
      'group-data-[collapsible=icon]:max-w-0'
    );
    expect(stagedCluster?.className).not.toContain(
      'group-data-[collapsible=icon]:hidden'
    );
  });

  it.each([
    {
      section: 'dashboard' as const,
      variant: 'jovie' as const,
      pathname: APP_ROUTES.DASHBOARD,
    },
    { section: 'ov' as const, variant: 'ov' as const, pathname: APP_ROUTES.OV },
  ])(
    'keeps the canonical $variant logo exposed when restored collapsed',
    ({ section, variant, pathname }) => {
      electronRuntimeMock.isElectronRuntime = false;
      const { container } = renderUnifiedSidebar({
        section,
        variant,
        pathname,
        isAdmin: true,
        sidebarDefaultOpen: false,
      });
      const logos = container.querySelectorAll(
        `[data-brand-variant="${variant}"]`
      );
      expect(logos).toHaveLength(1);
      expect(
        logos[0].parentElement?.closest('[inert], [aria-hidden="true"]')
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Switch Workspace' })
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Expand sidebar' })
      ).toHaveLength(1);
    }
  );

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
    expect(
      screen.getByRole('button', { name: 'Ask Jovie' })
    ).toBeInTheDocument();
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

  it('keeps the static OV mark at nav-icon scale with no footer duplicate', () => {
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.OV,
      section: 'ov',
      variant: 'ov',
    });

    const marks = container.querySelectorAll('[data-brand-variant="ov"]');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('data-brand-mark-size', '16');
    expect(marks[0]?.closest('[data-sidebar="header"]')).not.toBeNull();
  });

  it('renders dedicated operator navigation without the customer dashboard nav', () => {
    const { container } = renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPS,
      section: 'ov',
      variant: 'ov',
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
    expect(screen.getByRole('group', { name: 'Account' })).toContainElement(
      screen.getByTestId('user-button')
    );
    expect(userButtonPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ showUserInfo: true, profileHref: undefined })
    );
    expect(
      screen.queryByRole('button', { name: 'Sign Out' })
    ).not.toBeInTheDocument();
    for (const link of operatorLinks) {
      expect(link).toHaveAttribute('data-navigation-item-id');
      expect(link).toHaveClass('grid', 'rounded-lg');
    }
    expect(
      container.querySelector('[data-sidebar-dock="true"]')
    ).toContainElement(screen.getByTestId('sidebar-whats-new'));
    expect(
      container.querySelector('[data-sidebar-dock="true"]')
    ).toContainElement(screen.getByTestId('sidebar-now-playing-bridge'));
  });

  it('marks only the exact Operations destination current', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPERATIONS,
      section: 'ov',
    });

    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Chat' })
    ).not.toHaveAttribute('aria-current');
    const operationsLink = within(operatorNavigation).getByRole('link', {
      name: 'Operations',
    });
    expect(operationsLink).toHaveAttribute('href', APP_ROUTES.ADMIN_OPERATIONS);
    expect(
      operatorNavigation.querySelectorAll('[aria-current="page"]')
    ).toHaveLength(1);
    expect(operationsLink).toHaveAttribute('aria-current', 'page');
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
