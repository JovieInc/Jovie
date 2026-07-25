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

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({ selectedProfile: mockProfile }),
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock(
  '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView',
  () => ({
    ShellReleasesView: (props: Record<string, unknown>) => (
      <div
        data-testid='releases-experience'
        data-count={String((props.releases as unknown[])?.length ?? 0)}
        data-spotify-connected={String(props.spotifyConnected)}
      >
        Releases
      </div>
    ),
  })
);

// Mock query hook — default: loaded with empty data
const mockQueryResult = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn().mockResolvedValue(undefined),
  error: undefined as Error | undefined,
};

const capturedPageErrorState = {
  props: null as Record<string, unknown> | null,
};

function getCapturedPageErrorStateProps() {
  return capturedPageErrorState.props;
}

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => mockQueryResult,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: (props: Record<string, unknown>) => {
    capturedPageErrorState.props = props;
    return <div data-testid='page-error'>{String(props.message ?? '')}</div>;
  },
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
    mockQueryResult.error = new Error('load failed');
    capturedPageErrorState.props = null;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('page-error')).toHaveTextContent(
      'We could not load your releases. Retry the request or refresh the page.'
    );
    const errorStateProps = getCapturedPageErrorStateProps();
    expect(errorStateProps).toMatchObject({
      title: 'Unable to load releases',
      actionLabel: 'Retry load',
    });
    expect(typeof errorStateProps?.onRetry).toBe('function');

    mockQueryResult.refetch.mockClear();
    (errorStateProps?.onRetry as (() => void) | undefined)?.();
    expect(mockQueryResult.refetch).toHaveBeenCalledTimes(1);

    // Reset
    mockQueryResult.isError = false;
    mockQueryResult.data = [];
    mockQueryResult.error = undefined;
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
      'data-spotify-connected',
      'true'
    );
  });

  it('keeps cached releases visible when a background refetch errors', () => {
    mockQueryResult.data = [{ id: 'r1' }] as unknown[];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = true;
    mockQueryResult.error = new Error('background refetch failed');

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('releases-experience')).toHaveAttribute(
      'data-count',
      '1'
    );

    mockQueryResult.data = [];
    mockQueryResult.isError = false;
    mockQueryResult.error = undefined;
  });
});
