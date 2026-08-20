import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnalyticsSidebar,
  AnalyticsSidebarView,
  calculateConversionRate,
  FUNNEL_STAGE_METRIC_ROW_CLASS,
  FUNNEL_STAGE_OUTER_CLASS,
  FunnelStage,
} from './AnalyticsSidebar';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: () => ({
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
    isLoading: false,
    isFetching: false,
  }),
}));

vi.mock('@/components/molecules/drawer', () => ({
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
    tabOptions,
    activeTab,
    onTabChange,
    tabbedCardTestId,
    testId,
  }: {
    children?: ReactNode;
    entityHeader?: ReactNode;
    tabOptions: Array<{ value: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
    tabbedCardTestId?: string;
    testId?: string;
  }) => (
    <div data-testid={testId} data-surface-variant='flat'>
      {entityHeader}
      <div data-testid={tabbedCardTestId} data-surface-variant='flat'>
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
    </div>
  ),
  StatTile: ({ label, value }: { label: string; value: string }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
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

describe('calculateConversionRate', () => {
  it('suppresses misleading percents on tiny bases', () => {
    expect(calculateConversionRate(12, 1)).toBeNull();
    expect(calculateConversionRate(3, 1)).toBeNull();
  });

  it('shows conversion percent once the base is large enough', () => {
    expect(calculateConversionRate(60, 30)).toBe('200%');
  });
});

describe('AnalyticsSidebar', () => {
  it('renders the canonical tabbed rail without nested raised surfaces', () => {
    const { container } = render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('analytics-sidebar-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);
    expect(screen.getByText('Audience funnel')).toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
  });

  it('keeps tab selection and ranked content in one accessible rail', async () => {
    const { fireEvent } = await import('@testing-library/react');
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
    ).toHaveLength(0);
    expect(screen.queryByText('Tip Link Visits')).not.toBeInTheDocument();

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

    expect(screen.getByText('Tip Link Visits')).toBeInTheDocument();
    expect(container.querySelector('.opacity-70')).not.toBeNull();
  });
});

describe('FunnelStage (regression: JOV-4158 / #13819 skeleton layout parity)', () => {
  const stageProps = {
    label: 'Profile Views',
    value: 120,
    rate: null as string | null,
    barPercent: 50,
    barIndex: 0,
  };

  it('uses identical outer padding + metric-row chrome in loading and loaded states', () => {
    const { container: loadingContainer } = render(
      <FunnelStage {...stageProps} loading />
    );
    const { container: loadedContainer } = render(
      <FunnelStage {...stageProps} loading={false} />
    );

    const loadingOuter = loadingContainer.firstElementChild;
    const loadedOuter = loadedContainer.firstElementChild;
    const loadingMetricRow = loadingOuter?.firstElementChild;
    const loadedMetricRow = loadedOuter?.firstElementChild;

    // Full className equality — shared constants cannot drift independently
    expect(loadingOuter?.className).toBe(FUNNEL_STAGE_OUTER_CLASS);
    expect(loadedOuter?.className).toBe(FUNNEL_STAGE_OUTER_CLASS);
    expect(loadingMetricRow?.className).toBe(FUNNEL_STAGE_METRIC_ROW_CLASS);
    expect(loadedMetricRow?.className).toBe(FUNNEL_STAGE_METRIC_ROW_CLASS);

    // Explicit padding tokens from the original bug report
    expect(loadingOuter).toHaveClass('px-3.5', 'py-2.5');
    expect(loadedOuter).toHaveClass('px-3.5', 'py-2.5');
    expect(loadingOuter).not.toHaveClass('px-3', 'py-2');
    expect(loadedOuter).not.toHaveClass('px-3', 'py-2');
  });

  it('keeps outer className stable when a conversion rate is present', () => {
    const { container: withoutRate } = render(
      <FunnelStage {...stageProps} rate={null} loading={false} />
    );
    const { container: withRate } = render(
      <FunnelStage {...stageProps} rate='40%' loading={false} />
    );

    expect(withoutRate.firstElementChild?.className).toBe(
      FUNNEL_STAGE_OUTER_CLASS
    );
    expect(withRate.firstElementChild?.className).toBe(
      FUNNEL_STAGE_OUTER_CLASS
    );
    expect(withoutRate.firstElementChild?.firstElementChild?.className).toBe(
      FUNNEL_STAGE_METRIC_ROW_CLASS
    );
    expect(withRate.firstElementChild?.firstElementChild?.className).toBe(
      FUNNEL_STAGE_METRIC_ROW_CLASS
    );
  });
});
