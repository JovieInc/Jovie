import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAnalytics } from './DashboardAnalytics';

const state = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  data: undefined as Record<string, unknown> | undefined,
}));
vi.mock('./useDashboardAnalytics', () => ({
  useDashboardAnalyticsState: () => ({
    ...state,
    artist: { id: 'artist' },
    range: '7d',
    setRange: vi.fn(),
    rangeTabsBaseId: 'ranges',
    rangePanelId: 'panel',
    activeRangeTabId: 'range-7d',
    refresh: vi.fn(),
    rangeLabel: 'Last 7 days',
  }),
}));
vi.mock('@/lib/queries', () => ({
  usePlanGate: () => ({ analyticsRetentionDays: 90 }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/features/dashboard/molecules/DashboardRefreshButton', () => ({
  DashboardRefreshButton: () => (
    <button type='button'>Refresh analytics</button>
  ),
}));

describe('DashboardAnalytics metric consumer states', () => {
  beforeEach(() => {
    state.loading = false;
    state.error = null;
    state.data = undefined;
  });

  it('shows unavailable values instead of fabricated zeroes after a failed observation', () => {
    state.error = 'Analytics unavailable';
    render(
      <TooltipProvider>
        <DashboardAnalytics />
      </TooltipProvider>
    );
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('stat-profile-views')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-unique-users')).toHaveTextContent('—');
  });

  it('renders loaded metrics, conversion percentages and ranked lists', () => {
    state.data = {
      profile_views: 100,
      unique_users: 50,
      subscribers: 5,
      top_cities: [{ city: 'London', count: 9 }],
      top_referrers: [{ referrer: '', count: 8 }],
      top_links: [{ id: 'listen', url: 'listen', clicks: 7 }],
    };
    render(
      <TooltipProvider>
        <DashboardAnalytics />
      </TooltipProvider>
    );
    expect(screen.getByTestId('stat-profile-views')).toHaveTextContent('100');
    expect(screen.getByTestId('stat-unique-users')).toHaveTextContent(
      '50% of views'
    );
    expect(screen.getByTestId('stat-subscribers')).toHaveTextContent(
      '10% conversion'
    );
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('Listen Link')).toBeInTheDocument();
  });

  it('hides contradictory values instead of presenting impossible conversion rates', () => {
    state.data = { profile_views: 10, unique_users: 20, subscribers: 2 };
    render(
      <TooltipProvider>
        <DashboardAnalytics />
      </TooltipProvider>
    );
    expect(screen.getByTestId('stat-unique-users-suspect')).toHaveTextContent(
      '—'
    );
    expect(screen.queryByText('200% of views')).not.toBeInTheDocument();
  });

  it('renders loading placeholders before any metric is available', () => {
    state.loading = true;
    render(
      <TooltipProvider>
        <DashboardAnalytics />
      </TooltipProvider>
    );
    expect(screen.queryByTestId('stat-profile-views')).not.toBeInTheDocument();
    expect(screen.queryByText('No city data yet')).not.toBeInTheDocument();
  });

  it('distinguishes observed empty metrics and lists from loading', () => {
    state.data = { profile_views: 0, unique_users: 0, subscribers: 0 };
    render(
      <TooltipProvider>
        <DashboardAnalytics />
      </TooltipProvider>
    );
    expect(screen.getByText('No city data yet')).toBeInTheDocument();
    expect(screen.getByText('No referrer data yet')).toBeInTheDocument();
    expect(screen.getByText('No link data yet')).toBeInTheDocument();
    expect(screen.getByTestId('stat-profile-views')).not.toHaveTextContent('—');
  });
});
