import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
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

describe('UnifiedSidebar operator navigation', () => {
  afterEach(() => {
    resetUnifiedSidebarTestState();
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
      // Company is collapsed here; Tools is open because Ops is active.
      ADMIN_NAV_REGISTRY.filter(item => item.section !== 'business').map(
        item => ({
          label: item.label,
          href: item.href,
        })
      )
    );
    expect(screen.queryByTestId('dashboard-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('ov-nav-section-tools').className).toBe('');
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

  it('marks only the exact Fleet destination current', () => {
    renderUnifiedSidebar({
      pathname: APP_ROUTES.ADMIN_OPERATIONS,
      section: 'ov',
    });

    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Shipping' })
    ).not.toHaveAttribute('aria-current');
    const operationsLink = within(operatorNavigation).getByRole('link', {
      name: 'Fleet',
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
    // Lists and smart views are Ovie-only (JOV-7802); the Jovie creator
    // sidebar lock stays intact.
    expect(screen.queryByTestId('operator-lists-nav')).not.toBeInTheDocument();
  });

  it('keeps Tools collapsed on Ovie Home until the founder opens it', () => {
    globalThis.localStorage?.removeItem('ovie.nav.tools-open.v1');
    renderUnifiedSidebar({ pathname: APP_ROUTES.OV, section: 'ov' });
    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Home' })
    ).toBeVisible();
    for (const link of ['Shipping', 'Fleet', 'Capacity']) {
      expect(
        within(operatorNavigation).getByRole('link', { name: link })
      ).toBeVisible();
    }
    const tools = within(operatorNavigation).getByRole('button', {
      name: 'Tools',
    });
    expect(tools).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(operatorNavigation).queryByRole('link', { name: 'Presence' })
    ).toBeNull();
    fireEvent.click(tools);
    expect(tools).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Presence' })
    ).toBeVisible();
    const business = within(operatorNavigation).getByRole('button', {
      name: 'Company',
    });
    expect(business).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(business);
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Growth' })
    ).toBeVisible();
    expect(globalThis.localStorage?.getItem('ovie.nav.business-open.v1')).toBe(
      '1'
    );
    expect(globalThis.localStorage?.getItem('ovie.nav.tools-open.v1')).toBe(
      '1'
    );
  });

  it('exposes Inbox while Tools is collapsed and selects only Inbox', () => {
    globalThis.localStorage?.removeItem('ovie.nav.tools-open.v1');
    renderUnifiedSidebar({ pathname: APP_ROUTES.ADMIN_INBOX, section: 'ov' });
    const navigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    const inbox = within(navigation).getByRole('link', { name: 'Inbox' });
    expect(inbox).toBeVisible();
    expect(inbox).toHaveAttribute('href', APP_ROUTES.ADMIN_INBOX);
    expect(inbox).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).getByRole('link', { name: 'Home' })
    ).not.toHaveAttribute('aria-current');
    expect(
      within(navigation).getByRole('button', { name: 'Tools' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(navigation).queryByRole('link', { name: 'Needs You' })
    ).toBeNull();
  });

  it('renders founder lists in the Ovie sidebar outside the canonical landmark', async () => {
    renderUnifiedSidebar({ pathname: APP_ROUTES.ADMIN_OPS, section: 'ov' });
    const operatorNavigation = screen.getByRole('navigation', {
      name: 'OV Navigation',
    });
    // Lazy chunk: the lists block is split out of creator routes.
    const lists = await screen.findByTestId('operator-lists-nav');
    expect(operatorNavigation).not.toContainElement(lists);
    // Ovie is one Home plus Tools (Tim 2026-10-21). Tools holds the active
    // Ops page, so it is open and cannot be collapsed over it.
    expect(
      within(operatorNavigation).queryByText(/^(Workspaces|Utilities)$/)
    ).toBeNull();
    const tools = within(operatorNavigation).getByRole('button', {
      name: 'Tools',
    });
    expect(tools).toHaveAttribute('aria-expanded', 'true');
    expect(tools).toBeDisabled();
    expect(
      within(operatorNavigation).getByRole('link', { name: 'Ops' })
    ).toBeVisible();
    expect(lists).toBeInTheDocument();

    renderUnifiedSidebar({ pathname: APP_ROUTES.CHAT, section: 'dashboard' });
    expect(screen.getAllByTestId('operator-lists-nav')).toHaveLength(1);
  });
});
