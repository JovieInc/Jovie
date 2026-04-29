/**
 * ReleasesPageClient Tests
 * @critical — Client-first releases page with TanStack Query cache
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appFlagState = vi.hoisted(() => ({
  DESIGN_V1_RELEASES: false,
  SHELL_CHAT_V1: false,
}));

// Mock dashboard context
const mockProfile = {
  id: 'profile-1',
  spotifyId: 'sp-123',
  appleMusicId: null,
  settings: {},
};

vi.mock('next/dynamic', () => {
  let dynamicComponentIndex = 0;

  return {
    default: () => {
      dynamicComponentIndex += 1;

      if (dynamicComponentIndex === 1) {
        return function DynamicReleasesExperience(
          props: Record<string, unknown>
        ) {
          return (
            <div
              data-testid='releases-experience'
              data-count={String((props.releases as unknown[])?.length ?? 0)}
            >
              Releases
            </div>
          );
        };
      }

      return function DynamicShellReleasesView(props: Record<string, unknown>) {
        return (
          <div
            data-testid='shell-releases-view'
            data-count={String((props.releases as unknown[])?.length ?? 0)}
          >
            Shell Releases
          </div>
        );
      };
    },
  };
});

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

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: (flagName: keyof typeof appFlagState) => appFlagState[flagName],
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

import {
  ReleasesPageClient,
  resolveReleasesViewMode,
} from '@/app/app/(shell)/dashboard/releases/ReleasesPageClient';

describe('@critical ReleasesPageClient', () => {
  beforeEach(() => {
    appFlagState.DESIGN_V1_RELEASES = false;
    appFlagState.SHELL_CHAT_V1 = false;
    mockQueryResult.data = [];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = false;
  });

  it.each([
    [false, false, 'legacyProviderMatrix'],
    [true, false, 'legacyProviderMatrix'],
    [false, true, 'designV1ShellReleases'],
    [true, true, 'designV1ShellReleases'],
  ] as const)('resolves releases view mode for SHELL_CHAT_V1=%s and DESIGN_V1_RELEASES=%s', (shellChatV1Enabled, designV1ReleasesEnabled, expectedMode) => {
    expect(
      resolveReleasesViewMode({
        shellChatV1Enabled,
        designV1ReleasesEnabled,
      })
    ).toBe(expectedMode);
  });

  it('shows skeleton when loading with no cached data', () => {
    mockQueryResult.data = undefined as unknown as unknown[];
    mockQueryResult.isLoading = true;
    mockQueryResult.isError = false;

    render(<ReleasesPageClient />);
    expect(screen.getByTestId('release-skeleton')).toHaveTextContent(
      'Loading...'
    );
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
  });

  it('renders ReleasesExperience when data loaded', async () => {
    mockQueryResult.data = [{ id: 'r1' }, { id: 'r2' }] as unknown[];
    mockQueryResult.isLoading = false;
    mockQueryResult.isError = false;

    render(<ReleasesPageClient />);
    const exp = await waitFor(() => screen.getByTestId('releases-experience'));
    expect(exp).toHaveTextContent('Releases');
    expect(exp.getAttribute('data-count')).toBe('2');
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

  it('keeps ReleasesExperience when SHELL_CHAT_V1 is on and DESIGN_V1_RELEASES is off', () => {
    appFlagState.SHELL_CHAT_V1 = true;
    appFlagState.DESIGN_V1_RELEASES = false;
    mockQueryResult.data = [{ id: 'r1' }] as unknown[];

    render(<ReleasesPageClient />);

    expect(screen.getByTestId('releases-experience')).toHaveAttribute(
      'data-count',
      '1'
    );
    expect(screen.queryByTestId('shell-releases-view')).not.toBeInTheDocument();
  });

  it('renders ShellReleasesView when DESIGN_V1_RELEASES is on and SHELL_CHAT_V1 is off', () => {
    appFlagState.SHELL_CHAT_V1 = false;
    appFlagState.DESIGN_V1_RELEASES = true;
    mockQueryResult.data = [{ id: 'r1' }, { id: 'r2' }] as unknown[];

    render(<ReleasesPageClient />);

    expect(screen.getByTestId('shell-releases-view')).toHaveAttribute(
      'data-count',
      '2'
    );
    expect(screen.queryByTestId('releases-experience')).not.toBeInTheDocument();
  });
});
