import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPageClient } from '@/app/app/(shell)/calendar/CalendarPageClient';
import { CalendarRouteSkeleton } from '@/app/app/(shell)/calendar/CalendarRouteSkeleton';
import { buildReleaseTasksRoute } from '@/constants/routes';
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
  navigationReady: vi.fn(),
  getCachedAuth: vi.fn(),
  getDashboardDataEssential: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock('@/components/features/dashboard/NavigationDestinationReady', () => ({
  NavigationDestinationReady: (props: unknown) => {
    mocks.navigationReady(props);
    return null;
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardDataEssential: mocks.getDashboardDataEssential,
}));

vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: mocks.insertValues }) },
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

const confirmedEvent: EventRecord = {
  ...pendingEvent,
  id: 'event-2',
  title: 'Warehouse Set',
  subtitle: 'Detroit, MI · Manual',
  confirmationStatus: 'confirmed',
  providerKey: 'manual',
  reviewedAt: '2026-05-11T00:00:00.000Z',
  lastSyncedAt: null,
  provider: 'Manual',
  status: 'Sold out',
  ticketUrl: 'https://tickets.example.com/warehouse-set',
};

const rejectedEvent: EventRecord = {
  ...pendingEvent,
  id: 'event-3',
  title: 'Old Listing',
  subtitle: 'Detroit, MI · Songkick',
  confirmationStatus: 'rejected',
  providerKey: 'songkick',
  reviewedAt: '2026-05-12T00:00:00.000Z',
  lastSyncedAt: null,
  provider: 'Songkick',
};

function renderCalendar(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
) {
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

  it('opens the manual signing form from the calendar toolbar', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    const dialog = screen.getByRole('dialog', { name: 'Add Event' });
    expect(within(dialog).getByLabelText('Event Type')).toBeRequired();
    expect(within(dialog).getByLabelText('Venue Timezone')).toBeRequired();
    expect(
      within(dialog).getByLabelText('Ticket Link (Optional)')
    ).not.toBeRequired();
  });

  it('persists a private signing from the form and refreshes the owning profile caches', async () => {
    vi.useRealTimers();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getDashboardDataEssential.mockResolvedValue({
      selectedProfile: { id: 'profile-1' },
    });
    mocks.insertValues.mockReturnValue({
      returning: async () => [{ id: 'signing-1' }],
    });
    const client = new QueryClient();
    const cacheKeys = [
      ['events', 'list', 'profile-1'],
      ['tour-dates', 'list', 'profile-1'],
      ['events', 'list', 'profile-2'],
      ['tour-dates', 'list', 'profile-2'],
    ];
    for (const key of cacheKeys) client.setQueryData(key, []);
    renderCalendar(client);

    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add Event' }));
    const fields = [
      ['Event Type', 'signing'],
      ['Event Name', 'Book launch signing'],
      ['Venue Date And Time', '2026-11-20T20:00'],
      ['Venue Timezone', 'Pacific/Fiction'],
      ['Venue Name', 'City Books'],
      ['City', 'Los Angeles'],
      ['Country', 'US'],
    ];
    for (const [label, value] of fields) {
      fireEvent.change(dialog.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(dialog.getByRole('button', { name: 'Save Event' }));
    expect(
      await dialog.findByText(/enter a valid venue timezone/i)
    ).toBeVisible();
    expect(dialog.getByLabelText('Event Name')).toHaveValue(
      'Book launch signing'
    );
    expect(mocks.insertValues).not.toHaveBeenCalled();

    const retry = await dialog.findByRole('button', { name: 'Save Event' });
    fireEvent.change(dialog.getByLabelText('Venue Timezone'), {
      target: { value: 'America/Los_Angeles' },
    });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add Event' })).toBeNull();
    });
    expect(mocks.insertValues).toHaveBeenCalledExactlyOnceWith({
      profileId: 'profile-1',
      provider: 'manual',
      eventType: 'signing',
      confirmationStatus: 'confirmed',
      reviewedAt: expect.any(Date),
      title: 'Book launch signing',
      startDate: new Date('2026-11-21T04:00:00.000Z'),
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'City Books',
      city: 'Los Angeles',
      region: null,
      country: 'US',
      ticketUrl: null,
    });
    expect(
      cacheKeys.map(key => client.getQueryState(key)?.isInvalidated)
    ).toEqual([true, true, false, false]);
  });

  it('reads calendar releases from the canonical release matrix query', () => {
    renderCalendar();

    expect(mocks.useReleasesQuery).toHaveBeenCalledWith('profile-1');
    expect(screen.getByText('May Release')).toBeInTheDocument();
    expect(screen.getByText('Movement Festival')).toBeInTheDocument();
    expect(
      screen.queryByText('Releases and events at a glance.')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /17 May Release/ }));
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'href',
      buildReleaseTasksRoute(release.id)
    );
  });

  it('keeps event review filtering backed by the event query', () => {
    renderCalendar();

    expect(mocks.useEventsQuery).toHaveBeenCalledWith('profile-1');

    fireEvent.click(screen.getByRole('button', { name: 'Needs Review · 1' }));

    expect(screen.queryByText('May Release')).not.toBeInTheDocument();
    expect(screen.getByText('Movement Festival')).toBeInTheDocument();
  });

  it('keeps the selected-day detail consistent with the active filter', () => {
    renderCalendar();

    fireEvent.click(
      screen.getByRole('button', { name: /18 Movement Festival/ })
    );
    expect(screen.getAllByText('Movement Festival').length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: 'Releases' }));

    expect(screen.queryAllByText('Movement Festival')).toHaveLength(0);
    expect(screen.getByText('Nothing on this day.')).toBeInTheDocument();
  });

  it('keeps filters in a stable responsive rail while the calendar keeps the main plane', () => {
    renderCalendar();

    const filterRail = screen.getByTestId('calendar-filter-rail');
    expect(filterRail).toHaveAttribute('aria-label', 'Calendar Filters');
    expect(filterRail).toHaveClass('min-h-8', 'lg:flex-col');
    expect(filterRail.parentElement).toHaveClass(
      'system-b-calendar-workspace-grid'
    );
    expect(screen.getByTestId('calendar-main-plane')).toHaveClass(
      'system-b-calendar-main-plane'
    );
    expect(screen.getByTestId('calendar-weekday-grid').children).toHaveLength(
      7
    );
    expect(screen.getByTestId('calendar-month-grid').children).toHaveLength(42);
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass(
      'system-b-calendar-filter-pill'
    );
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('uses the shared event action source for overflow and context actions', () => {
    mocks.useEventsQuery.mockReturnValue({
      data: [pendingEvent, confirmedEvent, rejectedEvent],
      isLoading: false,
    });
    renderCalendar();

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'data-variant',
      'ghost'
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /18 Movement Festival Warehouse Set Old Listing/,
      })
    );

    const pendingRow = screen
      .getAllByText('Movement Festival')
      .at(-1)
      ?.closest('li');
    expect(pendingRow).toHaveClass('group');
    expect(
      within(pendingRow!).getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();

    fireEvent.contextMenu(pendingRow!);
    const contextMenu = screen.getByRole('menu');
    expect(
      within(contextMenu).getByRole('menuitem', { name: 'Confirm' })
    ).toBeInTheDocument();
    expect(
      within(contextMenu).getByRole('menuitem', { name: 'Reject' })
    ).toBeInTheDocument();

    fireEvent.click(
      within(contextMenu).getByRole('menuitem', { name: 'Confirm' })
    );
    expect(mocks.confirmEvent).toHaveBeenCalledWith(pendingEvent.id);
  });

  it('keeps the event overflow keyboard-accessible without changing its reserved slot', () => {
    renderCalendar();

    fireEvent.click(
      screen.getByRole('button', { name: /18 Movement Festival/ })
    );

    const eventRow = screen
      .getAllByText('Movement Festival')
      .at(-1)
      ?.closest('li');
    const overflow = within(eventRow!).getByRole('button', {
      name: 'More actions',
    });

    expect(eventRow).toHaveClass('group');
    expect(overflow.parentElement?.parentElement).toHaveClass('h-7', 'w-7');

    overflow.focus();
    fireEvent.keyDown(overflow, { key: 'Enter', code: 'Enter' });

    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Confirm' })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Reject' })
    ).toBeInTheDocument();
  });

  it('does not fetch scoped release or event data without a selected profile', () => {
    mocks.useDashboardData.mockReturnValue({
      selectedProfile: null,
    });
    renderCalendar();

    expect(mocks.useReleasesQuery).toHaveBeenCalledWith('');
    expect(mocks.useEventsQuery).toHaveBeenCalledWith('');
    expect(screen.queryByRole('button', { name: 'Add Event' })).toBeNull();
  });

  it('does not mark the destination ready when a calendar query fails', () => {
    mocks.useEventsQuery.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
    });

    renderCalendar();

    expect(mocks.navigationReady.mock.calls.at(-1)?.[0]).toMatchObject({
      destination: 'calendar',
      ready: false,
    });
  });

  it('renders named hooks for selected day, bulk actions, rejected expansion, and loading', () => {
    mocks.useEventsQuery.mockReturnValue({
      data: [pendingEvent, confirmedEvent, rejectedEvent],
      isLoading: true,
    });

    renderCalendar();

    const eventDay = screen.getByRole('button', {
      name: /18 Movement Festival Warehouse Set Old Listing/,
    });
    fireEvent.click(eventDay);

    expect(eventDay).toHaveClass('system-b-calendar-day-cell-selected');
    expect(screen.getByText('Loading calendar…')).toHaveClass(
      'system-b-calendar-loading-text'
    );

    const bulkSlot = screen
      .getByText('Pending Review · 1')
      .closest('div')
      ?.parentElement?.querySelector('.system-b-calendar-bulk-action-slot');
    expect(bulkSlot).toBeInTheDocument();
    expect(bulkSlot).toHaveAttribute('data-active', 'false');

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Movement Festival/ })
    );

    expect(bulkSlot).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByRole('button', { name: 'Confirm Selected (1)' })
    ).toHaveClass('system-b-calendar-action-confirm');
    expect(
      screen.getByRole('button', { name: 'Reject Selected (1)' })
    ).toHaveClass('system-b-calendar-action-reject');

    const rejectedToggle = screen.getByRole('button', {
      name: 'Show rejected · 1',
    });
    expect(rejectedToggle).toHaveClass('system-b-calendar-rejected-toggle');
    fireEvent.click(rejectedToggle);

    expect(screen.getAllByText('Old Listing')).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'More actions' })
    ).toHaveLength(3);
    expect(
      screen
        .getByRole('checkbox', { name: /Movement Festival/ })
        .closest('li')
        ?.querySelector('[data-selected="true"]')
    ).toBeInTheDocument();
  });
});

describe('CalendarRouteSkeleton', () => {
  it('reserves the same filter rail and calendar plane as the hydrated workspace', () => {
    render(<CalendarRouteSkeleton />);

    expect(screen.getByLabelText('Loading Calendar')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-filter-rail-skeleton')).toHaveClass(
      'min-h-8',
      'lg:flex-col'
    );
    expect(screen.getByTestId('calendar-grid-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-grid-skeleton')).toHaveClass(
      'system-b-calendar-main-plane'
    );
    expect(
      screen
        .getByTestId('calendar-grid-skeleton')
        .querySelectorAll('.system-b-calendar-month-grid > div')
    ).toHaveLength(49);
  });
});
