import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAnalyticsCards } from './DashboardAnalyticsCards';

const query = vi.hoisted(() => ({
  data: undefined as
    | { profile_views: number; unique_users: number }
    | undefined,
  error: null as Error | null,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
}));
vi.mock('@/lib/queries', () => ({ useDashboardAnalyticsQuery: () => query }));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('DashboardAnalyticsCards consumer states', () => {
  beforeEach(() => {
    query.data = undefined;
    query.error = null;
    query.isLoading = false;
    query.isFetching = false;
    query.refetch.mockReset();
  });

  it('transitions from initial skeleton to truthful unavailable metrics', () => {
    query.isLoading = true;
    const { rerender } = render(<DashboardAnalyticsCards refreshSignal={0} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading Analytics Overview'
    );
    query.isLoading = false;
    query.error = new Error('Unavailable');
    rerender(<DashboardAnalyticsCards refreshSignal={1} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Analytics Overview Unavailable'
    );
    expect(
      screen.getByLabelText('Profile Views Metric Unavailable')
    ).toHaveTextContent('Temporarily unavailable');
    expect(screen.queryByText('No profile views yet')).not.toBeInTheDocument();
  });

  it('shows the sharing empty state only after observed empty data', () => {
    query.data = { profile_views: 0, unique_users: 0 };
    render(<DashboardAnalyticsCards profileUrl='https://jovie.test/artist' />);
    expect(screen.getByText('No profile views yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy Profile Link' })
    ).toBeInTheDocument();
  });

  it('keeps existing metrics visible while refresh is pending and suppresses duplicate clicks', () => {
    query.data = { profile_views: 100, unique_users: 40 };
    const { rerender } = render(<DashboardAnalyticsCards refreshSignal={0} />, {
      wrapper: TooltipProvider,
    });
    const refresh = screen.getByRole('button', {
      name: 'Refresh Analytics Overview',
    });
    fireEvent.click(refresh);
    expect(query.refetch).toHaveBeenCalledOnce();
    query.isFetching = true;
    rerender(<DashboardAnalyticsCards refreshSignal={1} />);
    expect(refresh).toBeDisabled();
    expect(screen.getByText('Unique Visitors')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(
      screen.queryByText('Loading Analytics Overview')
    ).not.toBeInTheDocument();
  });
});
