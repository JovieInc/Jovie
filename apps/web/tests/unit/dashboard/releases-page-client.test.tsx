/**
 * ReleasesPageClient Tests
 * @critical — Client-first releases page with TanStack Query cache
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dashboard context
const mockProfile = {
  id: 'profile-1',
  spotifyId: 'sp-123',
  appleMusicId: null,
  settings: {},
};

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ selectedProfile: mockProfile }),
}));

// Mock query hook — reset in beforeEach to avoid state leakage
const mockQueryResult = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
};

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => mockQueryResult,
}));

vi.mock('@/features/dashboard/organisms/release-provider-matrix', () => ({
  ReleasesExperience: (props: Record<string, unknown>) => (
    <div
      data-testid='releases-experience'
      data-count={String((props.releases as unknown[])?.length ?? 0)}
      data-spotify-connected={String(Boolean(props.spotifyConnected))}
    >
      Releases
    </div>
  ),
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
  beforeEach(() => {
    mockQueryResult.data = [];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = false;
  });

  it('shows skeleton when loading with no cached data', () => {
    mockQueryResult.data = undefined as unknown as unknown[];
    mockQueryResult.isLoading = true;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('release-skeleton')).toBeDefined();
  });

  it('shows PageErrorState when query errors', () => {
    mockQueryResult.data = undefined as unknown as unknown[];
    mockQueryResult.isError = true;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('page-error')).toBeDefined();
    expect(
      screen.getByText('Failed to load releases data. Please refresh the page.')
    ).toBeDefined();
  });

  it('renders ReleasesExperience when data loaded', () => {
    mockQueryResult.data = [{ id: 'r1' }, { id: 'r2' }] as unknown[];

    render(<ReleasesPageClient />);
    const exp = screen.getByTestId('releases-experience');
    expect(exp).toBeDefined();
    expect(exp.getAttribute('data-count')).toBe('2');
  });

  it('renders ReleasesExperience with empty array when no releases', () => {
    render(<ReleasesPageClient />);
    const exp = screen.getByTestId('releases-experience');
    expect(exp.getAttribute('data-count')).toBe('0');
  });

  it('derives spotifyConnected from selectedProfile.spotifyId', () => {
    render(<ReleasesPageClient />);
    expect(
      screen
        .getByTestId('releases-experience')
        .getAttribute('data-spotify-connected')
    ).toBe('true');
  });
});
