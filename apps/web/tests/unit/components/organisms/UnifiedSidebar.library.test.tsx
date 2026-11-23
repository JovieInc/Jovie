import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  electronRuntimeMock,
  nowPlayingBridgePropsMock,
  renderUnifiedSidebar,
  resetUnifiedSidebarTestState,
  userButtonPropsMock,
} from './UnifiedSidebar.test-harness';

vi.mock('next/link', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextLinkMock()
);

vi.mock('next/navigation', async () =>
  (await import('./UnifiedSidebar.mock-factories')).nextNavigationMock()
);

vi.mock('@/lib/desktop/electron-bridge', async importOriginal =>
  (await import('./UnifiedSidebar.mock-factories')).electronBridgeMock(
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()
  )
);

vi.mock('@/hooks/useClerkSafe', async () =>
  (await import('./UnifiedSidebar.mock-factories')).clerkSafeMock()
);

vi.mock('@/features/dashboard/dashboard-nav', async () =>
  (await import('./UnifiedSidebar.mock-factories')).dashboardNavMock()
);

vi.mock('@/components/shell/HeaderSearchSurfaceFromContext', async () =>
  (await import('./UnifiedSidebar.mock-factories')).headerSearchSurfaceMock()
);

vi.mock('@/components/organisms/user-button', async () =>
  (await import('./UnifiedSidebar.mock-factories')).userButtonMock()
);

vi.mock('@/components/organisms/SidebarDockBridge', async () =>
  (await import('./UnifiedSidebar.mock-factories')).sidebarDockBridgeMock()
);

describe('UnifiedSidebar library route', () => {
  afterEach(() => {
    resetUnifiedSidebarTestState();
  });

  it('shows the seeded creator name in demo workspace chrome', () => {
    renderUnifiedSidebar({ pathname: '/demo', section: 'dashboard' });
    const brand = document.querySelector('[data-sidebar-brand-row]');
    expect(brand).toHaveTextContent('Tim White');
    expect(brand).not.toHaveTextContent('Demo');
    expect(
      screen.getByRole('button', { name: 'Search Sidebar' })
    ).toBeVisible();
  });

  it('keeps the route back link available without idle prefetch', () => {
    renderUnifiedSidebar({ overrideContent: <span>Releases</span> });
    const link = screen.getByRole('link', { name: 'Back to App' });
    expect(link).toHaveAttribute('href', APP_ROUTES.CHAT);
    expect(link).toHaveAttribute('data-prefetch', 'false');
  });

  it('mounts the flyout-capable rail as the left navigation region', () => {
    renderUnifiedSidebar();
    const rail = document.querySelector('#shell-left-rail');
    expect(rail).toHaveAttribute('data-rail-preview-region', 'left');
    expect(rail?.querySelector('[data-sidebar="sidebar"]')).not.toBeNull();
  });

  it('pins the sidebar content scrollport so focusing New Chat does not shift the shell', () => {
    renderUnifiedSidebar();

    expect(document.querySelector('[data-sidebar="content"]')).toHaveClass(
      'overflow-anchor-none'
    );
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
    expect(nowPlayingBridgePropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ collapsed: false })
    );
    const row = screen
      .getByRole('link', { name: 'Inbox' })
      .closest('[data-sidebar-brand-row]');
    expect(row).toContainElement(
      screen.getByRole('button', { name: 'Search Sidebar' })
    );
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/app'
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

  it('prefetches Shipping on hover and keyboard focus without duplicate requests', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise(() => {}));
    renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPS,
      section: 'ov',
      variant: 'ov',
    });
    const nav = screen.getByRole('navigation', { name: 'OV Navigation' });
    const link = within(nav).getByRole('link', { name: 'Shipping' });
    fireEvent.mouseOver(link);
    fireEvent.focus(link);
    const shippingCalls = () =>
      fetchMock.mock.calls.filter(([url]) => url === '/api/hud/shipping-state');
    await waitFor(() => expect(shippingCalls()).toHaveLength(1));
    expect(shippingCalls()[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockRestore();
  });
});
