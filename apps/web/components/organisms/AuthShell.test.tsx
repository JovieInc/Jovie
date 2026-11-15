import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AppShellSection } from '@/types/app-shell';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { AuthShell } from './AuthShell';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));
vi.mock('@/lib/desktop/electron-runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-runtime')>()),
  useIsElectronRuntime: () => false,
}));
vi.mock('./AppShellFrame', () => ({
  AppShellFrame: ({
    sidebar,
    header,
    main,
    mobileBottomNav,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
    mobileBottomNav?: ReactNode;
  }) => (
    <div data-testid='auth-shell-frame'>
      {sidebar}
      {header}
      <main>{main}</main>
      {mobileBottomNav}
    </div>
  ),
}));
vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: ({ section }: { section: string }) => (
    <nav aria-label='Sidebar' data-section={section}>
      Sidebar
    </nav>
  ),
}));
vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: ({
    breadcrumbs,
    sidebarTrigger,
  }: {
    breadcrumbs: DashboardBreadcrumbItem[];
    sidebarTrigger?: ReactNode;
  }) => (
    <header>
      {sidebarTrigger}
      <nav aria-label='Breadcrumb'>
        {breadcrumbs.map(crumb => (
          <span key={crumb.label}>{crumb.label}</span>
        ))}
      </nav>
    </header>
  ),
}));
vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));
vi.mock('@/components/features/chat/Composer', () => ({
  useComposerFocus: () => ({ isComposerFocused: false }),
}));
vi.mock('./PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  RuntimeUpdateProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));
vi.mock('./OperatorMobileNavigation', () => ({
  OperatorMobileNavigation: () => (
    <nav aria-label='OV Mobile Navigation'>OV</nav>
  ),
}));
vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => <nav aria-label='Dashboard Tabs'>Tabs</nav>,
}));
vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

function Shell({
  section = 'dashboard',
  breadcrumbs = [{ label: 'Releases' }],
  sidebarDefaultOpen = true,
  onSidebarOpenChange,
  children = <p>Customer shell content</p>,
}: {
  readonly section?: AppShellSection;
  readonly breadcrumbs?: DashboardBreadcrumbItem[];
  readonly sidebarDefaultOpen?: boolean;
  readonly onSidebarOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
}) {
  return (
    <TooltipProvider>
      <AuthShell
        section={section}
        breadcrumbs={breadcrumbs}
        sidebarDefaultOpen={sidebarDefaultOpen}
        onSidebarOpenChange={onSidebarOpenChange}
        showMobileTabs
      >
        {children}
      </AuthShell>
    </TooltipProvider>
  );
}

describe('AuthShell', () => {
  it('pins a collapsed sidebar from the header toggle and reports the change', async () => {
    const user = userEvent.setup();
    const onSidebarOpenChange = vi.fn();
    const { container } = render(
      <Shell
        sidebarDefaultOpen={false}
        onSidebarOpenChange={onSidebarOpenChange}
      />
    );

    const toggle = screen.getByRole('button', { expanded: false });
    await user.click(toggle);

    expect(onSidebarOpenChange).toHaveBeenCalledWith(true);
    // Once pinned, the rail owns its toggle and the header trigger leaves.
    expect(toggle).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the customer header, content and mobile tabs', async () => {
    const { container } = render(<Shell />);

    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toHaveAttribute(
      'data-section',
      'dashboard'
    );
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(screen.getByText('Customer shell content')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Dashboard Tabs' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('drops the top header in settings and swaps in operator navigation', async () => {
    const { container, rerender } = render(<Shell section='settings' />);
    expect(screen.queryByRole('banner')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(<Shell section='ov' />);
    expect(
      screen.getByRole('navigation', { name: 'OV Mobile Navigation' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Dashboard Tabs' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with long breadcrumbs in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Shell
          breadcrumbs={[
            { label: 'الإصدارات' },
            {
              label:
                'عنوان ألبوم طويل جدا يستمر إلى ما بعد عرض الشريط (إصدار الذكرى الموسع)',
            },
          ]}
        >
          <p>محتوى الصفحة</p>
        </Shell>
      </div>
    );
    expect(screen.getByText('محتوى الصفحة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
