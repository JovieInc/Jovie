import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPageClient } from '@/app/app/(shell)/calendar/CalendarPageClient';
import type { EventRecord } from '@/lib/queries/useEventsQuery';

const mocks = vi.hoisted(() => ({
  useDashboardData: vi.fn(),
  useEventsQuery: vi.fn(),
  useReleasesQuery: vi.fn(),
  confirmEvent: vi.fn(),
  confirmEvents: vi.fn(),
  rejectEvent: vi.fn(),
  rejectEvents: vi.fn(),
  undoRejectEvent: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: mocks.useDashboardData,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/events-actions', () => ({
  confirmEvent: mocks.confirmEvent,
  confirmEvents: mocks.confirmEvents,
  rejectEvent: mocks.rejectEvent,
  rejectEvents: mocks.rejectEvents,
  undoRejectEvent: mocks.undoRejectEvent,
}));

vi.mock('@/lib/queries/useEventsQuery', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/queries/useEventsQuery')
  >('@/lib/queries/useEventsQuery');
  return {
    ...actual,
    useEventsQuery: mocks.useEventsQuery,
  };
});

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: mocks.useReleasesQuery,
}));

const release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'May Release',
  artistNames: ['Tim White'],
  releaseDate: '2026-05-17T00:00:00.000Z',
  status: 'scheduled',
  artworkUrl: null,
  slug: 'may-release',
  smartLinkPath: '/tim/may-release',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
};

const pendingEvent: EventRecord = {
  id: 'event-1',
  title: 'Movement Festival',
  subtitle: 'Detroit, MI · Bandsintown',
  eventDate: '2026-05-18T20:00:00.000Z',
  timezone: 'America/Detroit',
  eventType: 'tour',
  confirmationStatus: 'pending',
  providerKey: 'bandsintown',
  reviewedAt: null,
  lastSyncedAt: '2026-05-10T00:00:00.000Z',
  provider: 'Bandsintown',
};

function renderCalendar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <CalendarPageClient />
    </QueryClientProvider>
  );
}

describe('CalendarPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'));
    mocks.useDashboardData.mockReturnValue({
      selectedProfile: { id: 'profile-1' },
    });
    mocks.useReleasesQuery.mockReturnValue({
      data: [release],
      isLoading: false,
    });
    mocks.useEventsQuery.mockReturnValue({
      data: [pendingEvent],
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads calendar releases from the canonical release matrix query', () => {
    renderCalendar();

    expect(mocks.useReleasesQuery).toHaveBeenCalledWith('profile-1');
    expect(screen.getByText('May Release')).toBeInTheDocument();
    expect(screen.getByText('Movement Festival')).toBeInTheDocument();
  });

  it('keeps event review filtering backed by the event query', () => {
    renderCalendar();

    expect(mocks.useEventsQuery).toHaveBeenCalledWith('profile-1');

    fireEvent.click(screen.getByRole('button', { name: 'Needs review · 1' }));

    expect(screen.queryByText('May Release')).not.toBeInTheDocument();
    expect(screen.getByText('Movement Festival')).toBeInTheDocument();
  });

  it('does not fetch scoped release or event data without a selected profile', () => {
    mocks.useDashboardData.mockReturnValue({
      selectedProfile: null,
    });
    renderCalendar();

    expect(mocks.useReleasesQuery).toHaveBeenCalledWith('');
    expect(mocks.useEventsQuery).toHaveBeenCalledWith('');
  });
});
