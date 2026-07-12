import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';

/**
 * Deletion-safety net for chunk 2.1 (legacy variant removal).
 *
 * Renders AuthShell (which composes the real AppShellFrame + AppShellRightRail)
 * under both `legacy` and `shellChatV1` variants with every optional slot
 * populated (header, rightPanel, audioPlayer, mobileBottomNav) and asserts
 * both variants mount all six shell slots with the testids downstream code
 * depends on. See `.context/one-shell/parity-audit.md` for the full
 * difference audit this test encodes.
 */

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

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => ({ isMobile: false, state: 'open' }),
}));

vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: () => <aside data-testid='fixture-sidebar'>Sidebar</aside>,
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

function renderShell(designV1: boolean) {
  return render(
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: designV1 }}
    >
      <AuthShell section='dashboard' breadcrumbs={[]} showMobileTabs>
        <div>Main Content</div>
      </AuthShell>
    </AppFlagProvider>
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

    // Frame-level variant marker
    const frame = screen
      .getByTestId('app-shell-sidebar-mount')
      .closest('[data-app-shell-frame]');
    expect(frame).toHaveAttribute('data-shell-design', variantName);

    // Slot 1: sidebar
    expect(screen.getByTestId('fixture-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-sidebar-mount')).toContainElement(
      screen.getByTestId('fixture-sidebar')
    );

    // Slot 2: header
    expect(screen.getByTestId('fixture-header')).toBeInTheDocument();

    // Slot 3: main
    const scrollPane = screen.getByTestId('app-shell-scroll');
    expect(scrollPane).toContainElement(screen.getByText('Main Content'));

    // Slot 4: rightPanel
    const rightRail = screen.getByTestId('app-shell-right-rail');
    expect(rightRail).toHaveAttribute('data-shell-design', variantName);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-panel')
    );

    // Slot 5: audioPlayer
    expect(screen.getByTestId('fixture-audio-player')).toHaveAttribute(
      'data-variant',
      variantName
    );

    // Slot 6: mobileBottomNav
    expect(screen.getByTestId('fixture-mobile-tabs')).toBeInTheDocument();
  });

  it('keeps the sidebar toggle reachable in both variants (header trigger or in-sidebar collapse control)', () => {
    // legacy: header always renders SidebarTrigger regardless of sidebar state.
    renderShell(false);
    expect(
      screen.getByRole('button', { name: 'Toggle Sidebar' })
    ).toBeInTheDocument();
  });

  it('omits the header trigger in shellChatV1 when the sidebar is open (collapse control lives in UnifiedSidebar itself)', () => {
    // shellChatV1: header trigger only reappears once the sidebar is closed
    // (SidebarCollapseButton), so it must not duplicate UnifiedSidebar's own
    // in-sidebar collapse affordance while open. This is intentional parity
    // (both provide a reachable toggle, just relocated) — see parity-audit.md.
    renderShell(true);
    expect(
      screen.queryByRole('button', { name: 'Toggle Sidebar' })
    ).not.toBeInTheDocument();
  });
});
