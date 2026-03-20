'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getReleaseTaskSummary,
  getReleaseTasks,
} from '@/app/app/(shell)/dashboard/releases/task-actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

export function useReleaseTasksQuery(releaseId: string) {
  return useQuery({
    queryKey: queryKeys.releaseTasks.byRelease(releaseId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getReleaseTasks(releaseId),
    ...STANDARD_CACHE,
    enabled: Boolean(releaseId),
  });
}

export function useReleaseTaskSummaryQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releaseTasks.summary(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getReleaseTaskSummary(profileId),
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
  });
}
