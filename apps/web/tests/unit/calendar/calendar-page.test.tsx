import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from '@/lib/queries';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getDashboardShellData: vi.fn(),
  getDehydratedState: vi.fn(() => ({ dehydrated: true })),
  getQueryClient: vi.fn(),
  loadReleaseMatrix: vi.fn(),
  loadTourDates: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  fetchQuery: vi.fn(
    async <T,>(options: { readonly queryFn: () => Promise<T> }) =>
      options.queryFn()
  ),
  captureError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

vi.mock('@/lib/queries/HydrateClient', () => ({
  HydrateClient: ({
    children,
    state,
  }: {
    readonly children: ReactNode;
    readonly state: unknown;
  }) => (
    <div data-state={JSON.stringify(state)} data-testid='hydrate-client'>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/queries/server', () => ({
  getDehydratedState: mocks.getDehydratedState,
  getQueryClient: mocks.getQueryClient,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: ({ message }: { readonly message: string }) => (
    <div data-testid='page-error'>{message}</div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardShellData: mocks.getDashboardShellData,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: mocks.loadReleaseMatrix,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: mocks.loadTourDates,
}));

vi.mock('@/app/app/(shell)/calendar/CalendarPageClient', () => ({
  CalendarPageClient: () => <div data-testid='calendar-client'>Calendar</div>,
}));

const { default: CalendarPage } = await import(
  '@/app/app/(shell)/calendar/page'
);

const selectedProfile = {
  id: 'profile-1',
  username: 'artist',
  usernameNormalized: 'artist',
};

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getDashboardShellData.mockResolvedValue({
      dashboardLoadError: null,
      needsOnboarding: false,
      selectedProfile,
    });
    mocks.getQueryClient.mockReturnValue({
      fetchQuery: mocks.fetchQuery,
    });
    mocks.loadReleaseMatrix.mockResolvedValue([
      {
        id: 'release-1',
        title: 'Loaded Release',
        artworkUrl: 'https://example.com/art.jpg',
        releaseDate: '2026-05-01T00:00:00.000Z',
        releaseType: 'single',
      },
    ]);
    mocks.loadTourDates.mockResolvedValue([
      {
        id: 'event-1',
        provider: 'bandsintown',
        eventType: 'tour',
        confirmationStatus: 'pending',
        reviewedAt: null,
        title: 'Loaded Event',
        startDate: '2026-05-02T20:00:00.000Z',
        timezone: 'America/Los_Angeles',
        venueName: 'The Room',
        city: 'Los Angeles',
        region: 'CA',
        country: 'US',
        ticketUrl: 'https://example.com/tickets',
        ticketStatus: 'sold_out',
        lastSyncedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);
  });

  it('redirects unauthenticated users to sign in with calendar return target', async () => {
    mocks.getCachedAuth.mockResolvedValueOnce({ userId: null });

    await expect(CalendarPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.CALENDAR}`
    );

    expect(mocks.getDashboardShellData).not.toHaveBeenCalled();
  });

  it('renders the dashboard load error state without prefetching data', async () => {
    const dashboardLoadError = new Error('db unavailable');
    mocks.getDashboardShellData.mockResolvedValueOnce({
      dashboardLoadError,
      needsOnboarding: false,
      selectedProfile: null,
    });

    render(await CalendarPage());

    expect(screen.getByTestId('page-error')).toHaveTextContent(
      'Failed to load calendar data. Please refresh the page.'
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Dashboard data load failed on calendar page',
      dashboardLoadError,
      { route: APP_ROUTES.CALENDAR }
    );
    expect(mocks.fetchQuery).not.toHaveBeenCalled();
  });

  it('redirects onboarded auth sessions that still need onboarding', async () => {
    mocks.getDashboardShellData.mockResolvedValueOnce({
      dashboardLoadError: null,
      needsOnboarding: true,
      selectedProfile: null,
    });

    await expect(CalendarPage()).rejects.toThrow(
      `REDIRECT:${APP_ROUTES.START}`
    );

    expect(mocks.fetchQuery).not.toHaveBeenCalled();
  });

  it('hydrates release matrix and events for the selected profile', async () => {
    render(await CalendarPage());

    expect(screen.getByTestId('hydrate-client')).toHaveAttribute(
      'data-state',
      '{"dehydrated":true}'
    );
    expect(screen.getByTestId('calendar-client')).toBeInTheDocument();
    expect(mocks.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.releases.matrix('profile-1'),
      })
    );
    expect(mocks.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.events.list('profile-1'),
      })
    );
    expect(mocks.loadReleaseMatrix).toHaveBeenCalledWith('profile-1');
    expect(mocks.loadTourDates).toHaveBeenCalledWith('profile-1');
  });
});
