import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';

const { unifiedSidebarMock } = vi.hoisted(() => ({
  unifiedSidebarMock: vi.fn(),
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
    variant,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
    mobileBottomNav?: ReactNode;
    contentClassName?: string;
    variant: 'legacy' | 'shellChatV1';
  }) => (
    <div
      data-testid='app-shell-frame'
      data-shell-design={variant}
      data-content-class={contentClassName}
    >
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

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => ({ isMobile: false, state: 'open' }),
}));

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
  MobileProfileDrawer: () => null,
}));

function renderAuthShell(designV1: boolean, showMobileTabs = false) {
  return render(
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: designV1 }}
    >
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
      <AuthShell section='ov' breadcrumbs={[]}>
        <div>OV Content</div>
      </AuthShell>
    </AppFlagProvider>
  );
}

describe('AuthShell DESIGN_V1 wiring', () => {
  beforeEach(() => {
    localStorage.removeItem(FF_OVERRIDES_KEY);
  });

  it('uses the legacy shell frame when DESIGN_V1 is disabled', () => {
    renderAuthShell(false);

    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-shell-design',
      'legacy'
    );
    expect(
      screen.getByRole('button', { name: 'Toggle Sidebar' })
    ).toBeInTheDocument();
  });

  it('uses the shell chat V1 frame when DESIGN_V1 is enabled', () => {
    renderAuthShell(true);

    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-shell-design',
      'shellChatV1'
    );
    expect(
      screen.queryByRole('button', { name: 'Toggle Sidebar' })
    ).not.toBeInTheDocument();
  });

  it('propagates OV mode to the sidebar on the first render', () => {
    renderOvAuthShell();

    expect(screen.getByText('Sidebar')).toHaveAttribute('data-section', 'ov');
    expect(screen.getByText('Sidebar')).toHaveAttribute('data-variant', 'ov');
  });

  it('keeps customer and OV mobile navigation mutually exclusive', () => {
    const { unmount } = renderAuthShell(false, true);

    expect(
      screen.getByRole('navigation', { name: 'Dashboard Tabs' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'OV Mobile Navigation' })
    ).not.toBeInTheDocument();

    const customerRender = screen.getByTestId('app-shell-frame');
    expect(customerRender).toHaveAttribute(
      'data-content-class',
      'pb-20 lg:pb-6'
    );

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
      'pb-20 lg:pb-6'
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
