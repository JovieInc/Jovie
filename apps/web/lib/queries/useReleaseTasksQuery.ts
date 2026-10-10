'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getReleaseTaskSummary,
  getReleaseTasks,
} from '@/app/app/(shell)/dashboard/releases/task-actions';
import { isEntitlementDenialError } from '@/lib/entitlements/plan-gate-errors';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

/** Never auto-retry expected plan gates (JOV-3861 retry-loop fix). */
function shouldRetryReleaseTaskQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (isEntitlementDenialError(error)) return false;
  return failureCount < 3;
}

export function useReleaseTasksQuery(releaseId: string) {
  return useQuery({
    queryKey: queryKeys.releaseTasks.byRelease(releaseId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getReleaseTasks(releaseId),
    ...STANDARD_CACHE,
    enabled: Boolean(releaseId),
    retry: shouldRetryReleaseTaskQuery,
  });
}

export function useReleaseTaskSummaryQuery(profileId: string) {
  return useQuery({
    queryKey: queryKeys.releaseTasks.summary(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getReleaseTaskSummary(profileId),
    ...STANDARD_CACHE,
    enabled: Boolean(profileId),
    retry: shouldRetryReleaseTaskQuery,
  });
}
