import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { DashboardAnalyticsResponse } from '@/types/analytics';

const { useDashboardAnalyticsQueryMock } = vi.hoisted(() => ({
  useDashboardAnalyticsQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: useDashboardAnalyticsQueryMock,
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

beforeEach(() => {
  useDashboardAnalyticsQueryMock.mockReturnValue({
    data: { ...loaded },
    isPending: false,
    isLoading: false,
    isFetching: false,
    isError: false,
  });
});

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

  it('shows loading, not "no visits", while a paused query has no data', () => {
    // Offline with no cache: pending but paused, so isLoading is false.
    useDashboardAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isLoading: false,
      isFetching: false,
      isError: false,
    });
    wrap(<ProfileSmartLinkAnalytics profileUrl={PROFILE_URL} />);

    expect(screen.getByTestId('profile-smart-link-analytics')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.queryByText(/No visits in the/)).toBeNull();
  });

  it('passes axe while loading, failed, partial, long and right-to-left', async () => {
    const cases = [
      { data: undefined, loading: true },
      { data: undefined, loading: false, isError: true },
      { data: { ...loaded, total_clicks: 0 }, loading: false },
      {
        data: {
          ...loaded,
          profile_views: 128_456_789,
          total_clicks: 98_765_432,
        },
        loading: false,
      },
    ];
    for (const props of cases) {
      const { container, unmount } = wrap(
        <ProfileSmartLinkAnalyticsView
          profileUrl={PROFILE_URL}
          range='30d'
          {...props}
        />
      );
      await expectNoA11yViolations(container);
      unmount();
    }

    const { container } = wrap(
      <div dir='rtl' lang='ar'>
        <ProfileSmartLinkAnalyticsView
          profileUrl='https://jov.ie/فنان'
          data={loaded}
          range='30d'
          loading={false}
        />
      </div>
    );
    expect(
      screen.getByTestId('drawer-analytics-metric-value-profile-views')
    ).toHaveTextContent('1,240');
    await expectNoA11yViolations(container);
  });

  it('shows zero link clicks beside counted views', () => {
    wrap(
      <ProfileSmartLinkAnalyticsView
        profileUrl={PROFILE_URL}
        data={{ ...loaded, total_clicks: 0 }}
        range='30d'
        loading={false}
      />
    );
    expect(
      screen.getByTestId('drawer-analytics-metric-value-link-clicks')
    ).toHaveTextContent('0');
  });
});
