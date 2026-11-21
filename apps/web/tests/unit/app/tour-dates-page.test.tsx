import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

const {
  captureErrorMock,
  checkConnectionMock,
  loadRouteContextMock,
  loadTourDatesMock,
} = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  checkConnectionMock: vi.fn(),
  loadRouteContextMock: vi.fn(),
  loadTourDatesMock: vi.fn(),
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

vi.mock('@/lib/queries/server', () => ({
  getQueryClient: () => serverQueryClient,
  getDehydratedState: () => dehydrate(serverQueryClient),
}));

// In the RSC graph, a client module's ordinary exports are client references.
vi.mock('@/lib/queries/useEventsQuery', () => ({
  tourDateToEventRecord: () => {
    throw new Error('Cannot call a client export from a Server Component');
  },
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

const legacyTour: TourDateViewModel = {
  id: 'tour-1',
  profileId: 'profile-1',
  externalId: 'bandsintown-1',
  provider: 'bandsintown',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: '2026-11-18T12:00:00.000Z',
  title: null,
  startDate: '2026-12-13T04:00:00.000Z',
  startTime: '20:00',
  timezone: 'America/Los_Angeles',
  venueName: 'The Hall',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  latitude: null,
  longitude: null,
  ticketUrl: 'https://example.com/tickets',
  ticketStatus: 'sold_out',
  lastSyncedAt: '2026-11-18T10:00:00.000Z',
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T12:00:00.000Z',
};

const importedLivestream: TourDateViewModel = {
  ...legacyTour,
  id: 'livestream-1',
  externalId: 'import-1',
  provider: 'admin_import',
  eventType: 'livestream',
  confirmationStatus: 'pending',
  reviewedAt: null,
  timezone: null,
  venueName: '',
  city: '',
  region: null,
  country: '',
  ticketUrl: null,
  ticketStatus: 'available',
};

let serverQueryClient: QueryClient;

describe('canonical tour dates page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverQueryClient = new QueryClient();
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      profileId: 'profile-1',
      dashboardData: {},
    });
    loadTourDatesMock.mockResolvedValue([legacyTour, importedLivestream]);
    checkConnectionMock.mockResolvedValue({
      connected: true,
      hasApiKey: true,
      artistName: 'Test Artist',
      lastSyncedAt: null,
    });
  });

  it('hydrates populated profile-scoped Events and legacy tour-date caches', async () => {
    const clientQueryClient = new QueryClient();
    render(
      <QueryClientProvider client={clientQueryClient}>
        {await TourDatesPage()}
      </QueryClientProvider>
    );

    expect(screen.getByTestId('tour-dates-page-client')).toHaveTextContent(
      'profile-1:tour-1,livestream-1'
    );
    expect(loadRouteContextMock).toHaveBeenCalledWith({
      route: '/app/tour-dates',
      dashboardErrorLogMessage: 'Dashboard data load failed on tour dates page',
      dashboardErrorMessage:
        'Failed to load tour dates. Please refresh the page.',
    });
    expect(loadTourDatesMock).toHaveBeenCalledWith('profile-1');

    expect(
      clientQueryClient.getQueryData(['tour-dates', 'list', 'profile-1'])
    ).toEqual([legacyTour, importedLivestream]);
    expect(
      clientQueryClient.getQueryData(['tour-dates', 'connection', 'profile-1'])
    ).toEqual({
      connected: true,
      hasApiKey: true,
      artistName: 'Test Artist',
      lastSyncedAt: null,
    });
    expect(
      clientQueryClient.getQueryData(['events', 'list', 'profile-1'])
    ).toEqual([
      {
        id: 'tour-1',
        title: 'The Hall',
        subtitle: 'Los Angeles, CA · Bandsintown',
        eventDate: legacyTour.startDate,
        timezone: 'America/Los_Angeles',
        eventType: 'tour',
        confirmationStatus: 'confirmed',
        providerKey: 'bandsintown',
        reviewedAt: legacyTour.reviewedAt,
        lastSyncedAt: legacyTour.lastSyncedAt,
        venue: 'The Hall',
        city: 'Los Angeles, CA',
        provider: 'Bandsintown',
        status: 'Sold out',
        ticketUrl: legacyTour.ticketUrl,
      },
      {
        id: 'livestream-1',
        title: 'Event',
        subtitle: 'Admin Import',
        eventDate: importedLivestream.startDate,
        timezone: null,
        eventType: 'livestream',
        confirmationStatus: 'pending',
        providerKey: 'admin_import',
        reviewedAt: null,
        lastSyncedAt: importedLivestream.lastSyncedAt,
        provider: 'Admin Import',
      },
    ]);
    expect(
      clientQueryClient.getQueryData(['events', 'list', 'profile-2'])
    ).toBeUndefined();
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

  it('renders the canonical error state when tour-date loading fails', async () => {
    const error = new Error('upstream unavailable');
    loadTourDatesMock.mockRejectedValueOnce(error);

    render(await TourDatesPage());

    expect(screen.getByTestId('page-error')).toHaveTextContent(
      'Failed to load tour dates. Please refresh the page.'
    );
    expect(screen.queryByTestId('tour-dates-page-client')).toBeNull();
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Tour dates page load failed',
      error,
      { route: '/app/tour-dates', profileId: 'profile-1' }
    );
  });
});
