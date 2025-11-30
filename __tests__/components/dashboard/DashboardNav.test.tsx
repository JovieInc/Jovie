import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/dashboard/actions';
import { DashboardDataProvider } from '@/app/dashboard/DashboardDataContext';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { SidebarProvider } from '@/components/organisms/Sidebar';

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

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  isAdmin: false,
};

function renderWithDashboardData(overrides: Partial<DashboardData> = {}) {
  const value: DashboardData = { ...baseDashboardData, ...overrides };

  return render(
    <DashboardDataProvider value={value}>
      <SidebarProvider>
        <DashboardNav />
      </SidebarProvider>
    </DashboardDataProvider>
  );
}

describe('DashboardNav', () => {
  it('renders primary navigation items', () => {
    renderWithDashboardData();

    const overviewLink = screen.getByRole('link', { name: 'Overview' });
    const linksLink = screen.getByRole('link', { name: 'Links' });
    const analyticsLink = screen.getByRole('link', { name: 'Analytics' });
    const audienceLink = screen.getByRole('link', { name: 'Audience' });

    expect(overviewLink).toBeInTheDocument();
    expect(linksLink).toBeInTheDocument();
    expect(analyticsLink).toBeInTheDocument();
    expect(audienceLink).toBeInTheDocument();
  });

  it('renders secondary navigation items', () => {
    renderWithDashboardData();

    const earningsLink = screen.getByRole('link', { name: 'Earnings' });
    const settingsLink = screen.getByRole('link', { name: 'Settings' });

    expect(earningsLink).toBeInTheDocument();
    expect(settingsLink).toBeInTheDocument();
  });

  it('applies active state to current page', () => {
    renderWithDashboardData();

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toHaveAttribute('data-active', 'true');
  });

  it('shows different styling for primary vs secondary nav', () => {
    renderWithDashboardData();

    const overviewLink = screen.getByRole('link', { name: /overview/i });
    const settingsLink = screen.getByRole('link', { name: /settings/i });

    expect(overviewLink).toBeInTheDocument();
    expect(settingsLink).toBeInTheDocument();
  });
});
