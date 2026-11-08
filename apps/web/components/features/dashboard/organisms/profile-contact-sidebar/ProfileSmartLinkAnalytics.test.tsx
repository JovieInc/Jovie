import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardAnalyticsResponse } from '@/types/analytics';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: () => ({
    data: { ...loaded },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import {
  buildProfileSmartLinkMetrics,
  ProfileSmartLinkAnalytics,
  ProfileSmartLinkAnalyticsView,
} from './ProfileSmartLinkAnalytics';

const loaded: DashboardAnalyticsResponse = {
  profile_views: 1240,
  total_clicks: 318,
  top_cities: [],
  top_countries: [],
  top_referrers: [],
};

const PROFILE_URL = 'https://jov.ie/timwhite';

function wrap(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

describe('buildProfileSmartLinkMetrics', () => {
  it('labels both tiles with the window', () => {
    expect(buildProfileSmartLinkMetrics(loaded, '30d')).toEqual([
      expect.objectContaining({
        id: 'profile-views',
        value: '1,240',
        hint: 'Last 30 days',
      }),
      expect.objectContaining({
        id: 'link-clicks',
        label: 'Link Clicks',
        value: '318',
        hint: 'Last 30 days',
      }),
    ]);
  });

  it('returns no tiles when nothing happened, instead of two zeros', () => {
    expect(
      buildProfileSmartLinkMetrics(
        { ...loaded, profile_views: 0, total_clicks: 0 },
        '30d'
      )
    ).toEqual([]);
  });
});

describe('ProfileSmartLinkAnalyticsView', () => {
  it('renders the shared summary card with both metrics and the share link', () => {
    wrap(<ProfileSmartLinkAnalytics profileUrl={PROFILE_URL} />);

    expect(
      screen.getByTestId('drawer-analytics-metric-value-profile-views')
    ).toHaveTextContent('1,240');
    expect(
      screen.getByTestId('drawer-analytics-metric-value-link-clicks')
    ).toHaveTextContent('318');
    expect(
      screen.getByTestId('profile-smart-link-control')
    ).toBeInTheDocument();
  });

  it('says plainly when the window had no visits, and keeps the share link', () => {
    wrap(
      <ProfileSmartLinkAnalyticsView
        profileUrl={PROFILE_URL}
        data={{ ...loaded, profile_views: 0, total_clicks: 0 }}
        range='30d'
        loading={false}
      />
    );

    expect(
      screen.getByText(
        'No visits in the last 30 days. Share your profile link to start counting views and clicks.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/drawer-analytics-metric-value/)).toBeNull();
    expect(
      screen.getByTestId('profile-smart-link-control')
    ).toBeInTheDocument();
  });

  it('keeps the same body and footer slots while loading', () => {
    wrap(
      <ProfileSmartLinkAnalyticsView
        profileUrl={PROFILE_URL}
        data={undefined}
        range='30d'
        loading
      />
    );

    const card = screen.getByTestId('profile-smart-link-analytics');
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('profile-smart-link-analytics-body')).toHaveClass(
      'min-h-27'
    );
    expect(
      screen.getByTestId('profile-smart-link-analytics-footer')
    ).toHaveClass('min-h-10');
    expect(screen.getByLabelText('Loading Analytics')).toBeInTheDocument();
  });

  it('keeps last good numbers on a failed refetch and shows the error only without data', () => {
    const { rerender } = wrap(
      <ProfileSmartLinkAnalyticsView
        profileUrl={PROFILE_URL}
        data={loaded}
        range='30d'
        loading={false}
        isError
      />
    );
    expect(screen.queryByText('Analytics unavailable')).toBeNull();

    rerender(
      <TooltipProvider>
        <ProfileSmartLinkAnalyticsView
          profileUrl={PROFILE_URL}
          data={undefined}
          range='30d'
          loading={false}
          isError
        />
      </TooltipProvider>
    );
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
  });
});
