import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnalyticsSidebar,
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
  }) => <div data-surface-variant={variant}>{children}</div>,
  DrawerSurfaceCard: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant?: 'card' | 'flat';
  }) => <div data-surface-variant={variant}>{children}</div>,
  DrawerTabbedCard: ({
    children,
    tabs,
    testId,
  }: {
    children?: ReactNode;
    tabs?: ReactNode;
    testId?: string;
  }) => (
    <div data-testid={testId} data-surface-variant='card'>
      {tabs}
      {children}
    </div>
  ),
  DrawerTabs: ({
    options,
    value,
    onValueChange,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
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
  EntitySidebarShell: ({
    children,
    entityHeader,
    'data-testid': testId,
  }: {
    children?: ReactNode;
    entityHeader?: ReactNode;
    'data-testid'?: string;
  }) => (
    <div data-testid={testId}>
      {entityHeader}
      {children}
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
  it('renders the sidebar with card surface variant', () => {
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('analytics-sidebar-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'card'
    );
    expect(screen.getByText('Audience funnel')).toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
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
