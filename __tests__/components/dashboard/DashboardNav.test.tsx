import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard/overview'),
}));

// Mock Tooltip component
vi.mock('@/components/atoms/Tooltip', () => ({
  Tooltip: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: string;
  }) => <div title={content}>{children}</div>,
}));

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

    expect(screen.getByText('Tipping')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('applies active state to current page', () => {
    render(<DashboardNav />);

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toHaveClass('bg-accent/10');
  });

  it('renders correctly when collapsed', () => {
    render(<DashboardNav collapsed={true} />);

    // Text should be hidden when collapsed
    const overviewText = screen.getByText('Overview');
    expect(overviewText).toHaveClass('opacity-0');
  });

  it('shows different styling for primary vs secondary nav', () => {
    render(<DashboardNav />);

    // Primary nav should have semibold font
    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toHaveClass('font-semibold');

    // Secondary nav should have medium font
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toHaveClass('font-medium');
  });
});
