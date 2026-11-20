import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsSidebarView } from './AnalyticsSidebar';

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

describe('AnalyticsSidebar cities tab with no city data', () => {
  const visitsWithoutCities = {
    profile_views: 40,
    unique_users: 18,
    subscribers: 2,
    total_clicks: 6,
    listen_clicks: 3,
    tip_link_visits: 0,
    top_cities: [],
    top_countries: [{ country: 'United States', count: 9 }],
    top_referrers: [],
    top_links: [],
  };

  function renderCities(
    overrides: Partial<Parameters<typeof AnalyticsSidebarView>[0]> = {}
  ) {
    return render(
      <AnalyticsSidebarView
        isOpen
        onClose={vi.fn()}
        data={visitsWithoutCities}
        loading={false}
        range='30d'
        onRangeChange={vi.fn()}
        activeTab='cities'
        onActiveTabChange={vi.fn()}
        {...overrides}
      />
    );
  }

  it('uses the designed empty anatomy: Title Case heading, one line, one action', () => {
    const onActiveTabChange = vi.fn();
    renderCities({ onActiveTabChange });

    expect(
      screen.getByRole('heading', { name: 'No City Data Yet' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cities appear as visitors with a known location open your profile.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Countries' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('countries');
  });

  it('offers no action when countries have nothing to show either', () => {
    renderCities({ data: { ...visitsWithoutCities, top_countries: [] } });

    expect(
      screen.getByRole('heading', { name: 'No City Data Yet' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Countries' })
    ).not.toBeInTheDocument();
  });
});
