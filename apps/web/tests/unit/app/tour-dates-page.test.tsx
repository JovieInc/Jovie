import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureErrorMock,
  checkConnectionMock,
  loadRouteContextMock,
  loadTourDatesMock,
  setQueryDataMock,
} = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  checkConnectionMock: vi.fn(),
  loadRouteContextMock: vi.fn(),
  loadTourDatesMock: vi.fn(),
  setQueryDataMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadRouteContextMock,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  checkBandsintownConnection: checkConnectionMock,
  loadTourDates: loadTourDatesMock,
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: captureErrorMock }));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    tourDates: {
      connection: (profileId: string) => [
        'tour-dates',
        'connection',
        profileId,
      ],
      list: (profileId: string) => ['tour-dates', 'list', profileId],
    },
    events: {
      list: (profileId: string) => ['events', 'list', profileId],
    },
  },
}));

vi.mock('@/lib/queries/server', () => ({
  getQueryClient: () => ({ setQueryData: setQueryDataMock }),
  getDehydratedState: () => ({ queries: [] }),
}));

vi.mock('@/lib/queries/HydrateClient', () => ({
  HydrateClient: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('@/lib/queries/useEventsQuery', () => ({
  tourDateToEventRecord: (tourDate: { readonly id: string }) => ({
    id: tourDate.id,
  }),
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { readonly message: string }) => (
    <div data-testid='page-error'>{message}</div>
  ),
}));

vi.mock('@/app/app/(shell)/tour-dates/TourDatesPageClient', () => ({
  TourDatesPageClient: ({
    profileId,
    initialTourDates,
  }: {
    readonly profileId: string;
    readonly initialTourDates: readonly { readonly id: string }[];
  }) => (
    <div data-testid='tour-dates-page-client'>
      {profileId}:{initialTourDates.map(tourDate => tourDate.id).join(',')}
    </div>
  ),
}));

import TourDatesPage from '@/app/app/(shell)/tour-dates/page';

describe('canonical tour dates page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      profileId: 'profile-1',
      dashboardData: {},
    });
    loadTourDatesMock.mockResolvedValue([{ id: 'tour-1' }]);
    checkConnectionMock.mockResolvedValue({
      connected: true,
      hasApiKey: true,
      artistName: 'Test Artist',
      lastSyncedAt: null,
    });
  });

  it('renders the normal entity surface and primes tour-date rail data', async () => {
    render(await TourDatesPage());

    expect(screen.getByTestId('tour-dates-page-client')).toHaveTextContent(
      'profile-1:tour-1'
    );
    expect(loadRouteContextMock).toHaveBeenCalledWith({
      route: '/app/tour-dates',
      dashboardErrorLogMessage: 'Dashboard data load failed on tour dates page',
      dashboardErrorMessage:
        'Failed to load tour dates. Please refresh the page.',
    });
    expect(setQueryDataMock).toHaveBeenCalledWith(
      ['events', 'list', 'profile-1'],
      [{ id: 'tour-1' }]
    );
  });

  it('renders an explicit profile error instead of detouring to Settings', async () => {
    loadRouteContextMock.mockResolvedValueOnce({
      ok: true,
      userId: 'user-1',
      profileId: null,
      dashboardData: {},
    });

    render(await TourDatesPage());

    expect(screen.getByTestId('page-error')).toHaveTextContent(
      'Select a profile to manage tour dates.'
    );
    expect(loadTourDatesMock).not.toHaveBeenCalled();
  });

  it('fails soft into a stable empty surface when prefetching fails', async () => {
    const error = new Error('upstream unavailable');
    loadTourDatesMock.mockRejectedValueOnce(error);

    render(await TourDatesPage());

    expect(screen.getByTestId('tour-dates-page-client')).toHaveTextContent(
      'profile-1:'
    );
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Tour dates page load failed',
      error,
      { route: '/app/tour-dates', profileId: 'profile-1' }
    );
  });
});
