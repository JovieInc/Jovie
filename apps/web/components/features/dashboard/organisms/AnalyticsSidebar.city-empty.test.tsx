import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSidebarView } from './AnalyticsSidebar';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
  }),
}));

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

describe('AnalyticsSidebar cities tab with no city data', () => {
  it('uses the designed empty anatomy: Title Case heading, one line, one action', () => {
    const onActiveTabChange = vi.fn();
    renderCities({ onActiveTabChange });

    const empty = screen.getByTestId('analytics-ranked-empty-state');
    expect(
      screen.getByRole('heading', { name: 'No City Data Yet' })
    ).toBeInTheDocument();
    expect(empty).toHaveTextContent(
      'Cities appear as visitors with a known location open your profile.'
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Countries' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('countries');
  });

  it('offers no action when countries have nothing to show either', () => {
    renderCities({ data: { ...visitsWithoutCities, top_countries: [] } });

    expect(
      screen.getByTestId('analytics-ranked-empty-state')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View Countries' })
    ).not.toBeInTheDocument();
  });
});
