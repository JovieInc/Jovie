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
    variant,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
    variant: 'legacy' | 'shellChatV1';
  }) => (
    <div data-testid='app-shell-frame' data-shell-design={variant}>
      {sidebar}
      {header}
      {main}
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
  DashboardMobileTabs: () => <nav>Mobile Tabs</nav>,
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

function renderAuthShell(designV1: boolean) {
  render(
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: designV1 }}
    >
      <AuthShell section='dashboard' breadcrumbs={[]}>
        <div>Shell Content</div>
      </AuthShell>
    </AppFlagProvider>
  );
}

function renderOvAuthShell() {
  render(
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
});
