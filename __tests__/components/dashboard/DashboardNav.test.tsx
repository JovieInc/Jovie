import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard/overview'),
}));

// Mock @jovie/ui Tooltip components
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    TooltipContent: ({ children }: { children: React.ReactNode }) => (
      <div role='tooltip'>{children}</div>
    ),
    TooltipProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

describe('DashboardNav', () => {
  it('renders primary navigation items', () => {
    render(<DashboardNav />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Links')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Audience')).toBeInTheDocument();
  });

  it('renders secondary navigation items', () => {
    render(<DashboardNav />);

    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('applies active state to current page', () => {
    render(<DashboardNav />);

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toHaveAttribute('data-active', 'true');
  });

  it('shows different styling for primary vs secondary nav', () => {
    render(<DashboardNav />);

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    const settingsLink = screen.getByRole('link', { name: /settings/i });

    expect(overviewLink).toBeInTheDocument();
    expect(settingsLink).toBeInTheDocument();
  });
});
