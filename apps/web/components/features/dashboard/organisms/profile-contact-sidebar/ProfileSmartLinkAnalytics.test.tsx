import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({
  data: undefined as
    | { profile_views: number; total_clicks: number }
    | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: () => query,
}));

import { ProfileSmartLinkAnalytics } from './ProfileSmartLinkAnalytics';

describe('ProfileSmartLinkAnalytics', () => {
  beforeEach(() => {
    query.data = undefined;
    query.isLoading = false;
    query.isFetching = false;
    query.isError = false;
    query.refetch.mockReset();
  });

  it('renders observed metrics once loaded', () => {
    query.data = { profile_views: 1284, total_clicks: 96 };
    render(<ProfileSmartLinkAnalytics profileUrl='https://jov.ie/adele' />);

    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
  });

  it('offers a working retry when analytics fail to load', () => {
    query.isError = true;
    render(<ProfileSmartLinkAnalytics profileUrl='https://jov.ie/adele' />);

    expect(screen.getByText("Couldn't load analytics")).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});
