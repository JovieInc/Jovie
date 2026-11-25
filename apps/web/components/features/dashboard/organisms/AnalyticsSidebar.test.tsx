import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDashboardAnalyticsQuery as useQuery } from '@/lib/queries';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

import { AnalyticsSidebar, AnalyticsSidebarView } from './AnalyticsSidebar';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: vi.fn(() => ({
    data: {
      profile_views: 120,
      unique_users: 48,
      subscribers: 12,
      total_clicks: 22,
      listen_clicks: 9,
      tip_link_visits: 0,
      top_cities: [{ city: 'Los Angeles', count: 11 }],
      top_countries: [{ country: 'United States', count: 15 }],
      top_referrers: [{ referrer: 'Instagram', count: 6 }],
      top_links: [{ id: 'spotify', url: 'Spotify', clicks: 5 }],
    },
    isPending: false,
    isFetching: false,
  })),
}));

vi.mock('@/components/molecules/drawer', async () => ({
  DrawerStatGrid: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant?: 'card' | 'flush';
  }) => (
    <div data-surface-variant={variant === 'card' ? 'card' : 'flat'}>
      {children}
    </div>
  ),
  DrawerSurfaceCard: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant?: 'card' | 'flat';
  }) => <div data-surface-variant={variant}>{children}</div>,
  EntityTabbedRail: ({
    children,
    entityHeader,
    onClose,
    tabOptions,
    activeTab,
    onTabChange,
    tabbedCardTestId,
    tabbedSurfaceVariant = 'flat',
    testId,
    hideTabbedCard = false,
  }: {
    children?: ReactNode;
    entityHeader?: ReactNode;
    onClose?: () => void;
    tabOptions: Array<{ value: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
    tabbedCardTestId?: string;
    tabbedSurfaceVariant?: 'card' | 'flat';
    testId?: string;
    hideTabbedCard?: boolean;
  }) => (
    <div
      data-testid={testId}
      data-surface-variant='flat'
      data-close-handler={onClose ? 'present' : 'none'}
    >
      {entityHeader}
      {hideTabbedCard ? null : (
        <div
          data-testid={tabbedCardTestId}
          data-surface-variant={tabbedSurfaceVariant}
        >
          <div role='tablist' aria-label='Analytics data tabs'>
            {tabOptions.map(option => (
              <button
                key={option.value}
                type='button'
                role='tab'
                aria-selected={activeTab === option.value}
                onClick={() => onTabChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {children}
        </div>
      )}
    </div>
  ),
  ...(await import('@/components/molecules/drawer/StatTile')),
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: () => <div data-testid='drawer-header-actions' />,
}));

vi.mock('@/components/atoms/AppSegmentControl', () => ({
  AppSegmentControl: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange: (value: '7d' | '30d') => void;
    options: Array<{ value: '7d' | '30d'; label: string }>;
  }) => (
    <div>
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          role='tab'
          aria-selected={value === option.value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

describe('AnalyticsSidebar', () => {
  it('renders the funnel and tabbed rail on the shared rounded drawer card', () => {
    const { container } = render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('analytics-sidebar-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'card'
    );
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(2);
    expect(screen.getByTestId('analytics-sidebar')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(screen.getByTestId('analytics-sidebar')).toHaveAttribute(
      'data-close-handler',
      'present'
    );
    expect(screen.getByText('Audience funnel')).toBeInTheDocument();
    expect(screen.getByText('Unique Visitors')).toBeInTheDocument();
    expect(screen.getByText('Subscribers')).toBeInTheDocument();
    expect(screen.queryByText('Fans')).not.toBeInTheDocument();
    expect(screen.queryByText('Subscribed Fans')).not.toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
  });

  it('shows the skeleton, not zero counts, while the first fetch is paused offline', () => {
    vi.mocked(useQuery).mockReturnValueOnce({ isPending: true } as never);
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);
    expect(screen.queryByText('Unique Visitors')).not.toBeInTheDocument();
  });
  it('keeps tab selection and ranked content in one accessible rail', () => {
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);

    const sourcesTab = screen.getByRole('tab', { name: 'Sources' });
    fireEvent.click(sourcesTab);

    expect(sourcesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('keeps the flat rail stable across loading, refresh, and loaded metric states', () => {
    const onRangeChange = vi.fn();
    const onActiveTabChange = vi.fn();
    const { container, rerender } = render(
      <AnalyticsSidebarView
        isOpen
        onClose={vi.fn()}
        data={undefined}
        loading
        range='30d'
        onRangeChange={onRangeChange}
        activeTab='links'
        onActiveTabChange={onActiveTabChange}
      />
    );

    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(2);
    const loadingTracker = screen.getByRole('region', {
      name: 'Audience funnel',
    });
    expect(loadingTracker).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Tip Link Visits')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('stat-tile-value')).toHaveLength(2);
    for (const value of screen.getAllByTestId('stat-tile-value')) {
      expect(value).toHaveAttribute('aria-busy', 'true');
    }
    expect(screen.queryByText('Not measured')).not.toBeInTheDocument();

    rerender(
      <AnalyticsSidebarView
        isOpen
        onClose={vi.fn()}
        data={{
          profile_views: 120,
          unique_users: 48,
          subscribers: 12,
          total_clicks: 22,
          listen_clicks: 9,
          tip_link_visits: 4,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
          top_links: [{ id: 'spotify', url: 'Spotify', clicks: 5 }],
        }}
        loading={false}
        isFetching
        range='30d'
        onRangeChange={onRangeChange}
        activeTab='links'
        onActiveTabChange={onActiveTabChange}
      />
    );

    expect(screen.getByRole('region', { name: 'Audience funnel' })).toBe(
      loadingTracker
    );
    expect(loadingTracker).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('Tip Link Visits')).toBeInTheDocument();
    expect(screen.getByText('22')).toHaveAttribute('data-state', 'value');
    expect(screen.getByText('9')).toHaveAttribute('data-state', 'value');
    expect(screen.getByText('4')).toHaveAttribute('data-state', 'value');
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    expect(container.querySelector('.opacity-70')).not.toBeNull();
  });
});

describe('AnalyticsSidebar ranked-list density (JOV densify pass)', () => {
  it('keeps the desktop ranked rows and their loading shell on the 32px scale', () => {
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/AnalyticsRankedList.tsx'
      ),
      'utf8'
    );

    expect(source).not.toContain('flex h-9 items-center justify-between');
    expect(source).toContain(
      'flex h-8 items-center justify-between rounded-lg px-2.5'
    );
  });
});
// The Cities tab's empty state lives in AnalyticsSidebar.cities-empty.test.tsx.
describe('AnalyticsSidebar first look (no visits in range)', () => {
  const zeroData = {
    profile_views: 0,
    unique_users: 0,
    subscribers: 0,
    total_clicks: 0,
    listen_clicks: 0,
    tip_link_visits: 0,
    top_cities: [],
    top_countries: [],
    top_referrers: [],
    top_links: [],
  };

  function renderView(
    overrides: Partial<Parameters<typeof AnalyticsSidebarView>[0]> = {}
  ) {
    return render(
      <AnalyticsSidebarView
        isOpen
        onClose={vi.fn()}
        data={zeroData}
        loading={false}
        range='7d'
        onRangeChange={vi.fn()}
        activeTab='cities'
        onActiveTabChange={vi.fn()}
        {...overrides}
      />
    );
  }

  it('replaces the zero funnel, zero tiles and empty tabs with one empty state', () => {
    renderView();

    const empty = screen.getByTestId('analytics-rail-empty-state');
    expect(empty).toHaveTextContent('No Profile Visits Yet');
    expect(empty).toHaveTextContent('in the last 7 days');
    expect(
      screen.getByRole('link', { name: 'Share Your Profile' })
    ).toHaveAttribute('href', '/app/chat?panel=profile');
    expect(screen.queryByText('Unique Visitors')).not.toBeInTheDocument();
    expect(screen.queryByText('Link Clicks')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // Title and range control stay so the artist can widen the window.
    expect(screen.getByText('Audience funnel')).toBeInTheDocument();
  });

  it('never shows the empty state while loading, so the skeleton holds the loaded layout', () => {
    renderView({ data: undefined, loading: true });

    expect(
      screen.queryByTestId('analytics-rail-empty-state')
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('stat-tile-value')).toHaveLength(2);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows unverified values instead of declaring an empty window without measurements', () => {
    renderView({
      data: { ...zeroData, unique_users: undefined, subscribers: undefined },
    });

    expect(
      screen.queryByTestId('analytics-rail-empty-state')
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Unverified')).toHaveLength(2);
  });

  it('shows the funnel once any count is above zero', () => {
    renderView({ data: { ...zeroData, total_clicks: 1 } });

    expect(
      screen.queryByTestId('analytics-rail-empty-state')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
  });
});

describe('AnalyticsSidebar failed fetch (regression: Sentry on #24521)', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    loading: false,
    range: '30d' as const,
    onRangeChange: vi.fn(),
    activeTab: 'cities' as const,
    onActiveTabChange: vi.fn(),
  };

  it('shows the error state, not "No Profile Visits Yet", when the fetch fails', () => {
    const onRetry = vi.fn();
    render(
      <AnalyticsSidebarView {...baseProps} data={undefined} onRetry={onRetry} />
    );

    const error = screen.getByTestId('analytics-rail-error-state');
    expect(error).toHaveAttribute('data-content-state', 'error');
    expect(error).toHaveTextContent('Analytics Did Not Load');
    expect(
      screen.queryByTestId('analytics-rail-empty-state')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No Profile Visits Yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Unique Visitors')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the last good numbers when a refetch fails', () => {
    render(
      <AnalyticsSidebarView
        {...baseProps}
        data={{
          profile_views: 120,
          unique_users: 48,
          subscribers: 12,
          total_clicks: 22,
          listen_clicks: 9,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
        }}
        onRetry={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId('analytics-rail-error-state')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Unique Visitors')).toBeInTheDocument();
  });

  it('never claims zero visits without data; range control needs a handler', () => {
    const { rerender } = render(
      <AnalyticsSidebarView {...baseProps} data={undefined} />
    );
    expect(
      screen.queryByTestId('analytics-rail-empty-state')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '7D' })).toBeInTheDocument();

    rerender(
      <AnalyticsSidebarView
        {...baseProps}
        onRangeChange={undefined}
        data={undefined}
      />
    );
    expect(screen.queryByRole('tab', { name: '7D' })).not.toBeInTheDocument();
  });
});
