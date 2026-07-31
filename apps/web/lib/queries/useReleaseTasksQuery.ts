'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getReleaseTaskSummary,
  getReleaseTasks,
} from '@/app/app/(shell)/dashboard/releases/task-actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

/** Never auto-retry expected plan gates (JOV-3861 retry-loop fix). */
function shouldRetryReleaseTaskQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (error instanceof Error) {
    if (error.name === 'TasksUpgradeRequiredError') {
      return false;
    }
    const code = (error as { code?: unknown }).code;
    if (code === 'TASKS_WORKSPACE_LOCKED' || code === 'RELEASE_PLAN_LOCKED') {
      return false;
    }
    const message = error.message.toLowerCase();
    if (
      message.includes('requires a pro plan') ||
      message.includes('require a pro plan')
    ) {
      return false;
    }
  }
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
