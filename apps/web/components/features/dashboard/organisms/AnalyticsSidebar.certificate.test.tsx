import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import { AnalyticsSidebarView } from './AnalyticsSidebar';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: vi.fn(),
}));

const data: DashboardAnalyticsResponse = {
  profile_views: 120,
  unique_users: 48,
  subscribers: 12,
  total_clicks: 22,
  listen_clicks: 9,
  tip_link_visits: 4,
  top_cities: [{ city: 'Los Angeles', count: 11 }],
  top_countries: [{ country: 'United States', count: 15 }],
  top_referrers: [{ referrer: 'Instagram', count: 6 }],
  top_links: [{ id: 'spotify', url: 'Spotify', clicks: 5 }],
};

type ViewProps = React.ComponentProps<typeof AnalyticsSidebarView>;

function renderView(props: Partial<ViewProps> = {}, dir?: 'rtl') {
  const handlers = {
    onClose: vi.fn(),
    onRangeChange: vi.fn(),
    onActiveTabChange: vi.fn(),
  };
  const result = render(
    <TooltipProvider>
      <div dir={dir}>
        <AnalyticsSidebarView
          isOpen
          data={data}
          loading={false}
          range='30d'
          activeTab='cities'
          {...handlers}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
  return { ...result, handlers };
}

describe('AnalyticsSidebar certificate', () => {
  it('switches tabs and ranges from the loaded rail', async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderView();
    await expectNoA11yViolations(container);

    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(handlers.onActiveTabChange).toHaveBeenCalledWith('sources');
    await user.click(screen.getByRole('radio', { name: '7D' }));
    expect(handlers.onRangeChange).toHaveBeenCalledWith('7d');
  });

  it('keeps the loading (and offline first-load) skeleton axe-clean', async () => {
    const { container } = renderView({ loading: true, data: undefined });

    expect(screen.queryByText('No Profile Visits Yet')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('analytics-rail-error-state')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries a failed fetch instead of showing zeros', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = renderView({ data: undefined, onRetry });

    expect(screen.getByText('Analytics Did Not Load')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers countries from an empty cities tab', async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderView({
      data: { ...data, top_cities: [] },
    });

    expect(screen.getByText('No City Data Yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'View Countries' }));
    expect(handlers.onActiveTabChange).toHaveBeenCalledWith('countries');
  });

  it('drops tip visits and shows an empty sources tab for partial data', async () => {
    const { container } = renderView({
      activeTab: 'sources',
      data: { ...data, tip_link_visits: 0, top_referrers: [] },
    });

    expect(screen.queryByText('Tip Link Visits')).not.toBeInTheDocument();
    expect(screen.getByText('No source data yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long links and right-to-left content accessible', async () => {
    const long =
      'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=release-day';
    const { container } = renderView(
      {
        activeTab: 'links',
        data: {
          ...data,
          profile_views: 1284903,
          top_links: [{ id: 'a', url: long, clicks: 120443 }],
        },
      },
      'rtl'
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText('120,443')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
