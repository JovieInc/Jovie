'use client';

import { useMemo } from 'react';
import type {
  EntityProvider,
  EntityRef,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { type EventRecord, useEventsQuery } from '@/lib/queries/useEventsQuery';
import { EntityChip } from './EntityChip';

function eventMatches(event: EventRecord, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  if (event.title.toLowerCase().includes(lowerQuery)) return true;
  if (event.city && event.city.toLowerCase().includes(lowerQuery)) return true;
  return false;
}

function eventToEntityRef(event: EventRecord): EntityRef {
  return {
    kind: 'event',
    id: event.id,
    label: event.title,
    // No thumbnail — events are date-stamp tiles, not photos.
    thumbnail: undefined,
    meta: {
      kind: 'event',
      subtitle: event.subtitle,
      eventDate: event.eventDate,
      venue: event.venue,
      city: event.city,
      provider: event.provider,
      status: event.status,
      capacity: event.capacity,
      eventType: event.eventType,
    },
  };
}

/**
 * Build an EntityProvider for events scoped to a given profile.
 *
 * Initially backed by the tour-dates loader (every event today is
 * `eventType: 'tour'`). The provider shape is forward-compatible: when the
 * backend grows distinct event subtypes (meetups, charity gigs, TV guest
 * spots), only `useEventsQuery` changes — this provider keeps its contract.
 */
export function createEventProvider(profileId: string): EntityProvider {
  return {
    kind: 'event',
    label: 'Events',
    useSearch(query: string): EntitySearchResult {
      const { data, isLoading } = useEventsQuery(profileId);
      return useMemo(() => {
        const lowerQuery = query.toLowerCase();
        const items = (data ?? [])
          .filter(e => eventMatches(e, lowerQuery))
          .slice(0, 8)
          .map(eventToEntityRef);
        return { items, isLoading };
      }, [data, isLoading, query]);
    },
    renderChip(ref) {
      return <EntityChip data={ref} variant='input' isInputChip />;
    },
  };
}

/**
 * Exported for the slash menu's direct adapter — the picker calls
 * `useEventsQuery` itself for hook-order stability and uses this mapper.
 */
export { eventToEntityRef };
