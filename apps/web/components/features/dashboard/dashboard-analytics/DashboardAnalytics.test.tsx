import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

function renderAnalytics() {
  return render(
    <TooltipProvider>
      <DashboardAnalytics />
    </TooltipProvider>
  );
}

describe('DashboardAnalytics metric consumer states', () => {
  beforeEach(() => {
    state.loading = false;
    state.error = null;
    state.data = undefined;
  });

  it('shows unavailable values instead of fabricated zeroes after a failed observation', () => {
    state.error = 'Analytics unavailable';
    renderAnalytics();
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
      top_operating_systems: [{ os: 'iOS', count: 12 }],
    };
    renderAnalytics();
    expect(screen.getByTestId('stat-profile-views')).toHaveTextContent('100');
    expect(screen.getByTestId('stat-unique-users')).toHaveTextContent(
      '50% of views'
    );
    expect(screen.getByTestId('stat-subscribers')).toHaveTextContent(
      '10% conversion'
    );
    expect(
      screen.getByRole('heading', { name: 'Clicks by operating system' })
    ).toBeInTheDocument();
    expect(screen.getByText('iOS')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('Listen Link')).toBeInTheDocument();
  });

  it('shows Unknown for historical clicks without operating system data', () => {
    state.data = { top_operating_systems: [{ os: 'Unknown', count: 4 }] };
    renderAnalytics();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('hides contradictory values instead of presenting impossible conversion rates', () => {
    state.data = { profile_views: 10, unique_users: 20, subscribers: 2 };
    renderAnalytics();
    expect(screen.getByTestId('stat-unique-users-suspect')).toHaveTextContent(
      '—'
    );
    expect(screen.queryByText('200% of views')).not.toBeInTheDocument();
  });

  it('renders loading placeholders before any metric is available', () => {
    state.loading = true;
    renderAnalytics();
    expect(screen.queryByTestId('stat-profile-views')).not.toBeInTheDocument();
    expect(screen.queryByText('No city data yet')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No operating system data yet')
    ).not.toBeInTheDocument();
  });

  it('distinguishes observed empty metrics and lists from loading', () => {
    state.data = { profile_views: 0, unique_users: 0, subscribers: 0 };
    renderAnalytics();
    expect(screen.getByText('No city data yet')).toBeInTheDocument();
    expect(screen.getByText('No referrer data yet')).toBeInTheDocument();
    expect(screen.getByText('No link data yet')).toBeInTheDocument();
    expect(
      screen.getByText('No operating system data yet')
    ).toBeInTheDocument();
    expect(screen.getByTestId('stat-profile-views')).not.toHaveTextContent('—');
  });

  it('opens the metric definition from the keyboard and stays axe-clean', async () => {
    const user = userEvent.setup();
    state.data = { profile_views: 100, unique_users: 50, subscribers: 5 };
    const { container } = renderAnalytics();
    await expectNoA11yViolations(container);
    await user.tab();
    const help = screen.getByRole('button', { name: 'About Profile Views' });
    help.focus();
    expect(help).toHaveFocus();
    expect(help).toHaveAttribute('data-slot', 'plain-button');
    await user.keyboard('{Enter}');
    expect(screen.getAllByText(/./).length).toBeGreaterThan(0);
  });

  it('stays axe-clean while loading, after an error and with an empty window', async () => {
    state.loading = true;
    const loading = renderAnalytics();
    await expectNoA11yViolations(loading.container);
    loading.unmount();
    state.loading = false;
    state.error = 'Analytics unavailable';
    const failed = renderAnalytics();
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(failed.container);
    failed.unmount();
    state.error = null;
    state.data = { profile_views: 0, unique_users: 0, subscribers: 0 };
    const empty = renderAnalytics();
    await expectNoA11yViolations(empty.container);
  });

  it('renders long and right-to-left list labels axe-clean', async () => {
    state.data = {
      profile_views: 100,
      unique_users: 50,
      subscribers: 5,
      top_cities: [
        { city: 'القاهرة', count: 9 },
        {
          city: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
          count: 3,
        },
      ],
    };
    const { container } = renderAnalytics();
    expect(screen.getByText('القاهرة')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Top Cities', level: 2 })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
