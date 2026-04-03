import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSidebar } from './AnalyticsSidebar';

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
    variant?: 'card' | 'flush' | 'quiet';
  }) => <div data-surface-variant={variant}>{children}</div>,
  DrawerSurfaceCard: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant?: 'card' | 'flat' | 'quiet';
  }) => <div data-surface-variant={variant}>{children}</div>,
  DrawerTabbedCard: ({
    children,
    tabs,
    testId,
    surfaceVariant,
  }: {
    children?: ReactNode;
    tabs?: ReactNode;
    testId?: string;
    surfaceVariant?: 'card' | 'quiet';
  }) => (
    <div data-testid={testId} data-surface-variant={surfaceVariant}>
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
    surfaceTone,
    'data-testid': testId,
  }: {
    children?: ReactNode;
    entityHeader?: ReactNode;
    surfaceTone?: 'default' | 'quiet';
    'data-testid'?: string;
  }) => (
    <div data-testid={testId} data-surface-tone={surfaceTone}>
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

describe('AnalyticsSidebar', () => {
  it('opts into the quiet right-rail surface contract', () => {
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('analytics-sidebar')).toHaveAttribute(
      'data-surface-tone',
      'quiet'
    );
    expect(screen.getByTestId('analytics-sidebar-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'quiet'
    );
    expect(screen.getByText('Audience funnel')).toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
  });
});
