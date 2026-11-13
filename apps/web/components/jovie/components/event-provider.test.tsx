import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  createEventProvider,
  eventRowMatches,
  eventToEntityRef,
} from './event-provider';

const loadTourDates = vi.hoisted(() => vi.fn());
vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates,
}));

function eventFixture(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt_1',
    title: 'Elsewhere',
    subtitle: 'Brooklyn, NY · Bandsintown',
    eventDate: '2026-11-14T20:00:00.000Z',
    timezone: 'America/New_York',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    providerKey: 'bandsintown',
    reviewedAt: null,
    lastSyncedAt: null,
    venue: 'Elsewhere',
    city: 'Brooklyn, NY',
    provider: 'Bandsintown',
    ...overrides,
  } as EventRecord;
}

const PROFILE_ID = 'profile-1';

function EventResults({ query }: { readonly query: string }) {
  const provider = createEventProvider(PROFILE_ID);
  const { items, isLoading } = provider.useSearch(query);
  if (isLoading) return <p role='status'>Loading events</p>;
  if (items.length === 0) return <p>No matching events</p>;
  return (
    <ul aria-label='Events'>
      {items.map(item => (
        <li key={item.id}>{provider.renderChip(item)}</li>
      ))}
    </ul>
  );
}

function renderResults(query: string, events?: EventRecord[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (events) client.setQueryData(queryKeys.events.list(PROFILE_ID), events);
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <main>{children}</main>
    </QueryClientProvider>
  );
  return render(<EventResults query={query} />, { wrapper });
}

beforeEach(() => {
  loadTourDates.mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('eventRowMatches', () => {
  it('matches everything for an empty query, then title or city case-insensitively', () => {
    const event = eventFixture({ title: 'Elsewhere', city: 'Brooklyn, NY' });
    expect(eventRowMatches(event, '')).toBe(true);
    expect(eventRowMatches(event, 'elsewhere')).toBe(true);
    expect(eventRowMatches(event, 'brooklyn')).toBe(true);
    expect(eventRowMatches(event, 'berlin')).toBe(false);
    expect(eventRowMatches(eventFixture({ city: undefined }), 'brook')).toBe(
      false
    );
  });
});

describe('eventToEntityRef', () => {
  it('maps an event to an event ref with no thumbnail and its tour metadata', () => {
    const ref = eventToEntityRef(
      eventFixture({ status: 'Sold out', capacity: 450 })
    );
    expect(ref).toEqual({
      kind: 'event',
      id: 'evt_1',
      label: 'Elsewhere',
      thumbnail: undefined,
      meta: {
        kind: 'event',
        subtitle: 'Brooklyn, NY · Bandsintown',
        eventDate: '2026-11-14T20:00:00.000Z',
        venue: 'Elsewhere',
        city: 'Brooklyn, NY',
        provider: 'Bandsintown',
        status: 'Sold out',
        capacity: 450,
        eventType: 'tour',
      },
    });
  });
});

describe('createEventProvider', () => {
  it('scopes its registry key to the profile', () => {
    const provider = createEventProvider(PROFILE_ID);
    expect(provider.kind).toBe('event');
    expect(provider.label).toBe('Events');
    expect(provider.registryKey).toBe('event:profile-1');
  });

  it('renders cached events as input chips and stays axe-clean', async () => {
    const { container } = renderResults('', [
      eventFixture(),
      eventFixture({ id: 'evt_2', title: 'Berghain', city: 'Berlin' }),
    ]);
    const chips = screen.getAllByTestId('entity-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveAttribute('data-entity-kind', 'event');
    expect(chips[0]).toHaveAttribute('data-entity-chip', 'true');
    expect(chips[1]).toHaveTextContent('Berghain');
    expect(loadTourDates).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('filters by the query', async () => {
    const { container } = renderResults('berlin', [
      eventFixture(),
      eventFixture({ id: 'evt_2', title: 'Berghain', city: 'Berlin' }),
    ]);
    const chips = screen.getAllByTestId('entity-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent('Berghain');
    await expectNoA11yViolations(container);
  });

  it('caps a long list at eight results and keeps long titles whole', async () => {
    const longTitle =
      'An unusually long festival stage name that keeps going past the chip width';
    const { container } = renderResults(
      '',
      Array.from({ length: 12 }, (_, index) =>
        eventFixture({ id: `evt_${index}`, title: `${longTitle} ${index}` })
      )
    );
    const chips = screen.getAllByTestId('entity-chip');
    expect(chips).toHaveLength(8);
    expect(chips[0]).toHaveTextContent(`${longTitle} 0`);
    await expectNoA11yViolations(container);
  });

  it('returns no items when the profile has no events', async () => {
    const { container } = renderResults('', []);
    expect(screen.getByText('No matching events')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports loading while the first read is in flight', async () => {
    loadTourDates.mockReturnValue(new Promise(() => {}));
    const { container } = renderResults('');
    expect(screen.getByRole('status')).toHaveTextContent('Loading events');
    expect(loadTourDates).toHaveBeenCalledWith(PROFILE_ID);
    await expectNoA11yViolations(container);
  });

  it('pauses offline instead of loading forever, and returns no items', async () => {
    onlineManager.setOnline(false);
    const { container } = renderResults('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('No matching events')).toBeInTheDocument();
    expect(loadTourDates).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left event names without changing the result', async () => {
    const { container } = render(
      <div dir='rtl'>
        <QueryClientProvider
          client={(() => {
            const client = new QueryClient();
            client.setQueryData(queryKeys.events.list(PROFILE_ID), [
              eventFixture({ title: 'مسرح المدينة', city: 'دبي' }),
            ]);
            return client;
          })()}
        >
          <EventResults query='دبي' />
        </QueryClientProvider>
      </div>
    );
    expect(screen.getByTestId('entity-chip')).toHaveTextContent('مسرح المدينة');
    await expectNoA11yViolations(container);
  });
});
