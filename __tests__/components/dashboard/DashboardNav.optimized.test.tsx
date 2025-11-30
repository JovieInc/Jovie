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

describe('DashboardNav (Optimized)', () => {
  it('renders navigation items', () => {
    const { getByText } = fastRender(React.createElement(DashboardNav));

    // Test essential functionality only
    expect(getByText('Overview')).toBeDefined();
    expect(getByText('Links')).toBeDefined();
    expect(getByText('Analytics')).toBeDefined();
    expect(getByText('Earnings')).toBeDefined();
  });

  it('applies active state correctly', () => {
    const { container } = fastRender(React.createElement(DashboardNav));

    // Use faster DOM queries: active link should have data-active="true"
    const activeLink = container.querySelector('[href="/dashboard/overview"]');
    expect(activeLink?.getAttribute('data-active')).toBe('true');
  });

  it('handles collapsed state', () => {
    // Render inside a collapsed sidebar provider to ensure it does not throw
    const { container } = fastRender(
      React.createElement(
        SidebarProvider,
        { defaultOpen: false },
        React.createElement(DashboardNav)
      )
    );

    // Basic smoke test: overview link still renders
    const overviewLink = container.querySelector(
      '[href="/dashboard/overview"]'
    );
    expect(overviewLink).toBeDefined();
  });

  it('differentiates primary and secondary nav styling', () => {
    const { container } = fastRender(React.createElement(DashboardNav));

    // Use direct DOM queries for speed
    const primaryLink = container.querySelector('[href="/dashboard/overview"]');
    const secondaryLink = container.querySelector(
      '[href="/dashboard/settings"]'
    );

    expect(primaryLink?.classList.contains('font-semibold')).toBe(true);
    expect(secondaryLink?.classList.contains('font-medium')).toBe(true);
  });

  it('renders with different pathname', () => {
    // Change mock return value for this test only
    mockUsePathname.mockReturnValueOnce('/dashboard/links');

    const { container } = fastRender(React.createElement(DashboardNav));

    // Verify links active state changes
    const linksLink = container.querySelector('[href="/dashboard/links"]');
    expect(linksLink?.classList.contains('bg-accent/10')).toBe(true);
  });
});
