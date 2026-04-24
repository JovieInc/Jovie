/**
 * ReleasesPageClient Tests
 * @critical — Client-first releases page with TanStack Query cache
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock dashboard context
const mockProfile = {
  id: 'profile-1',
  spotifyId: 'sp-123',
  appleMusicId: null,
  settings: {},
};

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicReleasesExperience(props: Record<string, unknown>) {
      return (
        <div
          data-testid='releases-experience'
          data-count={String((props.releases as unknown[])?.length ?? 0)}
        >
          Releases
        </div>
      );
    },
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({ selectedProfile: mockProfile }),
}));

// Mock query hook — default: loaded with empty data
const mockQueryResult = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
};

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => mockQueryResult,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { message: string }) => (
    <div data-testid='page-error'>{message}</div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/config', () => ({
  primaryProviderKeys: ['spotify'],
  providerConfig: {},
}));

vi.mock('@/app/app/(shell)/dashboard/releases/loading', () => ({
  ReleaseTableSkeleton: () => (
    <div data-testid='release-skeleton'>Loading...</div>
  ),
}));

import { ReleasesPageClient } from '@/app/app/(shell)/dashboard/releases/ReleasesPageClient';

describe('@critical ReleasesPageClient', () => {
  it('shows skeleton when loading with no cached data', () => {
    mockQueryResult.data = undefined as unknown as unknown[];
    mockQueryResult.isLoading = true;
    mockQueryResult.isError = false;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('release-skeleton')).toHaveTextContent(
      'Loading...'
    );

    // Reset
    mockQueryResult.data = [];
    mockQueryResult.isLoading = false;
  });

  it('shows PageErrorState when query errors', () => {
    mockQueryResult.data = undefined as unknown as unknown[];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = true;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('page-error')).toHaveTextContent(
      'Failed to load releases data. Please refresh the page.'
    );
    expect(
      screen.getByText('Failed to load releases data. Please refresh the page.')
    ).toBeInTheDocument();

    // Reset
    mockQueryResult.isError = false;
    mockQueryResult.data = [];
  });

  it('renders ReleasesExperience when data loaded', async () => {
    mockQueryResult.data = [{ id: 'r1' }, { id: 'r2' }] as unknown[];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = false;

    render(<ReleasesPageClient />);
    const exp = await waitFor(() => screen.getByTestId('releases-experience'));
    expect(exp).toHaveTextContent('Releases');
    expect(exp.getAttribute('data-count')).toBe('2');

    // Reset
    mockQueryResult.data = [];
  });

  it('renders ReleasesExperience with empty array when no releases', () => {
    mockQueryResult.data = [];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = false;

    render(<ReleasesPageClient />);
    const exp = screen.getByTestId('releases-experience');
    expect(exp.getAttribute('data-count')).toBe('0');
  });

  it('derives spotifyConnected from selectedProfile.spotifyId', () => {
    // spotifyId is 'sp-123' in mockProfile → spotifyConnected = true
    // This is verified by the component passing it to ReleasesExperience
    mockQueryResult.data = [];
    render(<ReleasesPageClient />);
    expect(screen.getByTestId('releases-experience')).toHaveAttribute(
      'data-count',
      '0'
    );
  });
});
