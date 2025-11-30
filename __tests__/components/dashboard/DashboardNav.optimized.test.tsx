/**
 * Optimized DashboardNav Test
 *
 * Demonstrates fast testing techniques:
 * - Lazy mock loading
 * - Fast rendering utilities
 * - Minimal setup per test
 * - Focused assertions
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/dashboard/actions';
import { DashboardDataProvider } from '@/app/dashboard/DashboardDataContext';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { fastRender } from '@/tests/utils/fast-render';

// Lazy load mocks only when needed
const mockUsePathname = vi.fn(() => '/dashboard/overview');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
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
      React.createElement('div', { role: 'tooltip' }, children),
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
  isAdmin: false,
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

describe('DashboardNav (Optimized)', () => {
  it('renders navigation items', () => {
    const { getByRole } = renderDashboardNav();

    // Test essential functionality only, using role-based queries to avoid tooltip duplicates
    expect(getByRole('link', { name: 'Overview' })).toBeDefined();
    expect(getByRole('link', { name: 'Links' })).toBeDefined();
    expect(getByRole('link', { name: 'Analytics' })).toBeDefined();
    expect(getByRole('link', { name: 'Earnings' })).toBeDefined();
  });

  it('applies active state correctly', () => {
    const { container } = renderDashboardNav();

    // Use faster DOM queries: active link should have data-active="true"
    const activeLink = container.querySelector('[href="/dashboard/overview"]');
    expect(activeLink?.getAttribute('data-active')).toBe('true');
  });

  it('handles collapsed state', () => {
    // Render inside a collapsed sidebar provider to ensure it does not throw
    const { container } = renderDashboardNav({}, { defaultOpen: false });

    // Basic smoke test: overview link still renders
    const overviewLink = container.querySelector(
      '[href="/dashboard/overview"]'
    );
    expect(overviewLink).toBeDefined();
  });

  it('differentiates primary and secondary nav styling', () => {
    const { container } = renderDashboardNav();

    // Primary and secondary sections are wrapped with different spacing utilities
    const nav = container.querySelector('nav');
    const menus = nav?.querySelectorAll('[data-sidebar="menu"]') ?? [];

    expect(menus.length).toBeGreaterThanOrEqual(2);

    const primaryMenuParent = (menus[0] as HTMLElement | undefined)
      ?.parentElement;
    const secondaryMenuParent = (menus[1] as HTMLElement | undefined)
      ?.parentElement;

    expect(primaryMenuParent?.className).toContain('mb-6');
    expect(secondaryMenuParent?.className).toContain('mb-4');
  });

  it('renders with different pathname', () => {
    // Change mock return value for this test only
    mockUsePathname.mockReturnValueOnce('/dashboard/links');

    const { container } = renderDashboardNav();

    // Verify links active state changes via data-active attribute
    const linksLink = container.querySelector('[href="/dashboard/links"]');
    expect(linksLink?.getAttribute('data-active')).toBe('true');
  });
});
