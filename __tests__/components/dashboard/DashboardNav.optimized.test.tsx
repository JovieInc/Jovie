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
import { fastRender } from '@/tests/utils/fast-render';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

// Lazy load mocks only when needed
const mockUsePathname = vi.fn(() => '/dashboard/overview');
vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

// Lightweight tooltip mock
vi.mock('@/components/atoms/Tooltip', () => ({
  Tooltip: ({ children, content }: { children: React.ReactNode; content: string }) => 
    React.createElement('div', { title: content }, children),
}));

describe('DashboardNav (Optimized)', () => {
  it('renders navigation items', () => {
    const { getByText } = fastRender(React.createElement(DashboardNav));

    // Test essential functionality only
    expect(getByText('Overview')).toBeDefined();
    expect(getByText('Links')).toBeDefined();
    expect(getByText('Analytics')).toBeDefined();
    expect(getByText('Tipping')).toBeDefined();
  });

  it('applies active state correctly', () => {
    const { container } = fastRender(React.createElement(DashboardNav));
    
    // Use faster DOM queries
    const activeLink = container.querySelector('[href="/dashboard/overview"]');
    expect(activeLink?.classList.contains('bg-accent/10')).toBe(true);
  });

  it('handles collapsed state', () => {
    const { getByText } = fastRender(React.createElement(DashboardNav, { collapsed: true }));
    
    // Check only the essential collapsed behavior
    const overviewText = getByText('Overview');
    expect(overviewText.classList.contains('opacity-0')).toBe(true);
  });

  it('differentiates primary and secondary nav styling', () => {
    const { container } = fastRender(React.createElement(DashboardNav));
    
    // Use direct DOM queries for speed
    const primaryLink = container.querySelector('[href="/dashboard/overview"]');
    const secondaryLink = container.querySelector('[href="/dashboard/settings"]');
    
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
