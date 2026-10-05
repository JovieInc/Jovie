import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthShell,
  isWhatsNewBannerEnabled,
} from '@/components/organisms/AuthShell';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const { unifiedSidebarMock, sidebarMock } = vi.hoisted(() => ({
  unifiedSidebarMock: vi.fn(),
  sidebarMock: {
    isMobile: false,
    state: 'open' as 'open' | 'closed',
  },
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    sidebar,
    header,
    main,
    mobileBottomNav,
    contentClassName,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
    mobileBottomNav?: ReactNode;
    contentClassName?: string;
  }) => (
    <div data-testid='app-shell-frame' data-content-class={contentClassName}>
      {sidebar}
      {header}
      {main}
      {mobileBottomNav}
    </div>
  ),
}));

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => sidebarMock,
}));

vi.mock(
  '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton',
  () => ({
    SidebarCollapseButton: () => (
      <button type='button' data-testid='sidebar-rail-toggle'>
        Expand sidebar
      </button>
    ),
  })
);

vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: ({
    section,
    variant,
  }: {
    section: string;
    variant?: string;
  }) => {
    unifiedSidebarMock({ section, variant });
    return (
      <aside data-section={section} data-variant={variant}>
        Sidebar
      </aside>
    );
  },
}));

vi.mock('@/components/organisms/whats-new/WhatsNewBanner', () => ({
  WhatsNewBanner: ({ enabled }: { enabled: boolean }) => (
    <div data-testid='whats-new-slot' data-enabled={String(enabled)} />
  ),
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));

vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: ({ sidebarTrigger }: { sidebarTrigger?: ReactNode }) => (
    <header>{sidebarTrigger}Dashboard Header</header>
  ),
}));

vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => <nav aria-label='Dashboard Tabs'>Mobile Tabs</nav>,
}));

vi.mock('@/components/organisms/OperatorMobileNavigation', () => ({
  OperatorMobileNavigation: () => (
    <nav aria-label='OV Mobile Navigation'>OV Mobile Navigation</nav>
  ),
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => <button type='button'>Mobile Profile</button>,
}));

function render(ui: ReactNode) {
  return renderUI(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>
  );
}

function renderAuthShell(showMobileTabs = false) {
  return render(
    <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
      <AuthShell
        section='dashboard'
        breadcrumbs={[]}
        showMobileTabs={showMobileTabs}
      >
        <div>Shell Content</div>
      </AuthShell>
    </AppFlagProvider>
  );
}

function renderOvAuthShell() {
  return render(
    <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
      <AuthShell section='ov' breadcrumbs={[]} showMobileTabs>
        <div>OV Content</div>
      </AuthShell>
    </AppFlagProvider>
  );
}

describe('AuthShell runtime update wiring', () => {
  it('renders the shell frame inside the runtime update provider', () => {
    renderUI(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <SidebarProvider>
            <AuthShell section='dashboard' breadcrumbs={[]}>
              <div>Shell Content</div>
            </AuthShell>
          </SidebarProvider>
        </AppFlagProvider>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('app-shell-frame')).toBeInTheDocument();
  });
});

describe('AuthShell canonical wiring', () => {
  beforeEach(() => {
    sidebarMock.isMobile = false;
    sidebarMock.state = 'open';
    delete document.documentElement.dataset.desktopRuntime;
  });

  it('mounts the header collapse control in the browser when the rail is closed', () => {
    sidebarMock.state = 'closed';
    renderAuthShell();

    expect(screen.getByTestId('sidebar-rail-toggle')).toBeInTheDocument();
  });

  it('does not mount a second left-sidebar control in Electron (JOV-7207)', () => {
    // The desktop window-control row owns the single canonical toggle.
    document.documentElement.dataset.desktopRuntime = 'electron';
    sidebarMock.state = 'closed';
    renderAuthShell();

    expect(screen.queryByTestId('sidebar-rail-toggle')).not.toBeInTheDocument();
  });

  it('hydrates the collapsed Electron shell without replacing server content (JOV-7207)', async () => {
    sidebarMock.state = 'closed';
    const tree = (
      <QueryClientProvider client={new QueryClient()}>
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <AuthShell section='dashboard' breadcrumbs={[]}>
            <input aria-label='Retained draft' defaultValue='Server draft' />
          </AuthShell>
        </AppFlagProvider>
      </QueryClientProvider>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    const serverInput = container.querySelector('input');
    expect(serverInput).not.toBeNull();
    if (!serverInput) throw new Error('Missing server-rendered draft');
    serverInput.value = 'Draft typed before hydration';
    // Electron's preload identifies the runtime before React hydrates. The
    // server cannot see this marker; the first client tree must still match.
    document.documentElement.dataset.desktopRuntime = 'electron';
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector('input')).toBe(serverInput);
      expect(serverInput.value).toBe('Draft typed before hydration');
      expect(
        container.querySelector('[data-testid="sidebar-rail-toggle"]')
      ).toBeNull();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      delete document.documentElement.dataset.desktopRuntime;
    }
  });

  it('uses the single shell frame and in-sidebar collapse control', () => {
    renderAuthShell();

    expect(screen.getByTestId('app-shell-frame')).toBeInTheDocument();
    expect(screen.getByTestId('media-canvas-viewer')).not.toHaveAttribute(
      'open'
    );
    expect(
      screen.queryByRole('button', { name: 'Toggle Sidebar' })
    ).not.toBeInTheDocument();
  });

  it('propagates OV mode to the sidebar on the first render', () => {
    renderOvAuthShell();

    expect(screen.getByText('Sidebar')).toHaveAttribute('data-section', 'ov');
    expect(screen.getByText('Sidebar')).toHaveAttribute('data-variant', 'ov');
    expect(screen.queryByText('Mobile Tabs')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mobile Profile' })
    ).not.toBeInTheDocument();
  });

  it('keeps customer and OV mobile navigation mutually exclusive', () => {
    const { unmount } = renderAuthShell(true);

    expect(
      screen.getByRole('navigation', { name: 'Dashboard Tabs' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'OV Mobile Navigation' })
    ).not.toBeInTheDocument();

    const customerRender = screen.getByTestId('app-shell-frame');
    expect(customerRender).toHaveAttribute('data-content-class', 'lg:pb-6');

    unmount();
    renderOvAuthShell();

    expect(
      screen.getByRole('navigation', { name: 'OV Mobile Navigation' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Dashboard Tabs' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-content-class',
      'lg:pb-6'
    );
  });

  it('adds no mobile-navigation padding when no bottom navigation is mounted', () => {
    renderAuthShell(false);

    expect(
      screen.queryByRole('navigation', { name: 'Dashboard Tabs' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-shell-frame')).not.toHaveAttribute(
      'data-content-class'
    );
  });
});

describe("AuthShell What's New banner gating", () => {
  it('mounts the banner slot but keeps it off in automated tests', () => {
    renderOvAuthShell();

    expect(screen.getByTestId('whats-new-slot')).toHaveAttribute(
      'data-enabled',
      'false'
    );
  });

  it('enables the banner in the Mac app and the operator shell only', () => {
    const base = { isAutomatedTest: false } as const;
    expect(
      isWhatsNewBannerEnabled({
        ...base,
        section: 'dashboard',
        isElectron: true,
      })
    ).toBe(true);
    expect(
      isWhatsNewBannerEnabled({ ...base, section: 'ov', isElectron: false })
    ).toBe(true);
    expect(
      isWhatsNewBannerEnabled({
        ...base,
        section: 'dashboard',
        isElectron: false,
      })
    ).toBe(false);
    expect(
      isWhatsNewBannerEnabled({
        section: 'ov',
        isElectron: true,
        isAutomatedTest: true,
      })
    ).toBe(false);
  });
});
