'use client';

import { useQuery } from '@tanstack/react-query';
import { loadTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import {
  type EventRecord,
  tourDateToEventRecord,
} from '@/lib/events/event-record';
import { STANDARD_NO_REMOUNT_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export {
  type EventRecord,
  tourDateToEventRecord,
} from '@/lib/events/event-record';

/**
 * TanStack hook — returns all events for the active profile, mapped
 * through {@link tourDateToEventRecord}. Scoped by profileId so cache
 * never leaks between creators.
 */
export function useEventsQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.events.list(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: async (): Promise<EventRecord[]> => {
      const dates = await loadTourDates(profileId);
      return dates.map(tourDateToEventRecord);
    },
    ...STANDARD_NO_REMOUNT_CACHE,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === profileId ? previousData : undefined,
    enabled: Boolean(profileId),
  });
}
