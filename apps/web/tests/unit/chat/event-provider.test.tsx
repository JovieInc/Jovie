import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createEventProvider } from '@/components/jovie/components/event-provider';
import type { EventRecord } from '@/lib/queries/useEventsQuery';

// Mock the events query so the provider's useSearch hook returns our fixture
// without hitting the server-action. This exercises the same call surface
// the slash menu uses.
vi.mock('@/lib/queries/useEventsQuery', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/queries/useEventsQuery')
  >('@/lib/queries/useEventsQuery');
  return {
    ...actual,
    useEventsQuery: vi.fn(),
  };
});

import { useEventsQuery } from '@/lib/queries/useEventsQuery';

const FIXTURES: EventRecord[] = [
  {
    id: 'evt_brooklyn',
    title: 'Brooklyn Steel',
    subtitle: 'Brooklyn, NY · Bandsintown',
    eventDate: '2026-06-12T23:30:00.000Z',
    timezone: 'America/New_York',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    providerKey: 'bandsintown',
    reviewedAt: '2026-04-01T12:00:00.000Z',
    lastSyncedAt: '2026-04-01T12:00:00.000Z',
    venue: 'Brooklyn Steel',
    city: 'Brooklyn, NY',
    provider: 'Bandsintown',
    status: 'Sold out',
  },
  {
    id: 'evt_la',
    title: 'The Wiltern',
    subtitle: 'Los Angeles, CA · Bandsintown',
    eventDate: '2026-07-04T03:00:00.000Z',
    timezone: 'America/Los_Angeles',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    providerKey: 'bandsintown',
    reviewedAt: '2026-04-01T12:00:00.000Z',
    lastSyncedAt: '2026-04-01T12:00:00.000Z',
    venue: 'The Wiltern',
    city: 'Los Angeles, CA',
    provider: 'Bandsintown',
  },
];

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('createEventProvider', () => {
  it('exposes the event kind and label', () => {
    const provider = createEventProvider('profile_1');
    expect(provider.kind).toBe('event');
    expect(provider.label).toBe('Events');
  });

  it('maps EventRecord to EntityRef with event meta populated', () => {
    vi.mocked(useEventsQuery).mockReturnValue({
      data: FIXTURES,
      isLoading: false,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch(''), {
      wrapper: makeWrapper(),
    });

    expect(result.current.items).toHaveLength(2);
    const first = result.current.items[0];
    expect(first.kind).toBe('event');
    expect(first.id).toBe('evt_brooklyn');
    expect(first.label).toBe('Brooklyn Steel');
    expect(first.thumbnail).toBeUndefined();
    expect(first.meta).toMatchObject({
      kind: 'event',
      eventDate: '2026-06-12T23:30:00.000Z',
      eventType: 'tour',
      venue: 'Brooklyn Steel',
      city: 'Brooklyn, NY',
      provider: 'Bandsintown',
      status: 'Sold out',
    });
  });

  it('every record today is eventType=tour (forward-compat discriminator)', () => {
    vi.mocked(useEventsQuery).mockReturnValue({
      data: FIXTURES,
      isLoading: false,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch(''), {
      wrapper: makeWrapper(),
    });

    for (const item of result.current.items) {
      expect(item.meta?.kind).toBe('event');
      if (item.meta?.kind === 'event') {
        expect(item.meta.eventType).toBe('tour');
      }
    }
  });

  it('substring-filters by venue title', () => {
    vi.mocked(useEventsQuery).mockReturnValue({
      data: FIXTURES,
      isLoading: false,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch('wiltern'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('evt_la');
  });

  it('substring-filters by city', () => {
    vi.mocked(useEventsQuery).mockReturnValue({
      data: FIXTURES,
      isLoading: false,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch('brooklyn'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('evt_brooklyn');
  });

  it('forwards the underlying query loading state', () => {
    vi.mocked(useEventsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch(''), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('caps results at 8 items', () => {
    const many: EventRecord[] = Array.from({ length: 12 }, (_, i) => ({
      id: `evt_${i}`,
      title: `Venue ${i}`,
      subtitle: `City ${i} · Manual`,
      eventDate: `2026-06-${(i + 1).toString().padStart(2, '0')}T20:00:00.000Z`,
      timezone: null,
      eventType: 'tour' as const,
      confirmationStatus: 'confirmed' as const,
      providerKey: 'manual' as const,
      reviewedAt: null,
      lastSyncedAt: null,
      venue: `Venue ${i}`,
      city: `City ${i}`,
      provider: 'Manual',
    }));
    vi.mocked(useEventsQuery).mockReturnValue({
      data: many,
      isLoading: false,
    } as ReturnType<typeof useEventsQuery>);

    const provider = createEventProvider('profile_1');
    const { result } = renderHook(() => provider.useSearch(''), {
      wrapper: makeWrapper(),
    });

    expect(result.current.items).toHaveLength(8);
  });
});
