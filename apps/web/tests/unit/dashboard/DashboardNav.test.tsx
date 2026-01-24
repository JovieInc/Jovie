import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/dashboard/DashboardDataContext';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { fastRender } from '@/tests/utils/fast-render';

// Mock Next.js router with controllable return value
const mockUsePathname = vi.fn(() => '/app');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
  StatsigContext: React.createContext({ client: {} }),
}));

// Mock @jovie/ui Tooltip components
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
    TooltipProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
  };
});

const baseDashboardData: DashboardData = {
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
};

function renderDashboardNav(
  overrides: Partial<DashboardData> = {},
  sidebarProps: React.ComponentProps<typeof SidebarProvider> = {}
) {
  const value: DashboardData = { ...baseDashboardData, ...overrides };

  return fastRender(
    <DashboardDataProvider value={value}>
      <SidebarProvider {...sidebarProps}>
        <DashboardNav />
      </SidebarProvider>
    </DashboardDataProvider>
  );
}

describe('DashboardNav', () => {
  it('renders primary navigation items', () => {
    const { getByRole } = renderDashboardNav();

    expect(getByRole('link', { name: 'Dashboard' })).toBeDefined();
    expect(getByRole('link', { name: 'Profile' })).toBeDefined();
    expect(getByRole('link', { name: 'Contacts' })).toBeDefined();
    expect(getByRole('link', { name: 'Audience' })).toBeDefined();
  });

  it('renders secondary navigation items', () => {
    const { getByRole } = renderDashboardNav();

    expect(getByRole('link', { name: 'Earnings' })).toBeDefined();
  });

  it('applies active state to current page', () => {
    const { getByRole } = renderDashboardNav();

    const activeLink = getByRole('link', { name: 'Dashboard' });
    expect(activeLink.getAttribute('aria-current')).toBe('page');
  });

  it('handles collapsed state', () => {
    const { container } = renderDashboardNav({}, { defaultOpen: false });

    const overviewLink = container.querySelector('[href="/app"]');
    expect(overviewLink).toBeDefined();
    expect(overviewLink?.className).toContain('justify-center');
  });

  it('differentiates primary and secondary nav styling', () => {
    const { container } = renderDashboardNav();

    const nav = container.querySelector('nav');
    const menus = nav?.querySelectorAll('[data-sidebar="menu"]') ?? [];

    expect(menus.length).toBeGreaterThanOrEqual(1);

    const primaryMenuParent = (menus[0] as HTMLElement | undefined)
      ?.parentElement;
    const primaryGroup = primaryMenuParent?.parentElement;

    expect(primaryGroup?.className).toMatch(/space-y-1/);
  });

  it('renders with different pathname', () => {
    mockUsePathname.mockReturnValueOnce('/app/dashboard/profile');

    const { getByRole } = renderDashboardNav();

    const profileLink = getByRole('link', { name: 'Profile' });
    expect(profileLink.getAttribute('aria-current')).toBe('page');
  });
});
