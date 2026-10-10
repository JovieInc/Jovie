'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getTask,
  getTaskBoard,
  getTaskStats,
  getTasks,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { isEntitlementDenialError } from '@/lib/entitlements/plan-gate-errors';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';
import type { TaskFilters } from '@/lib/tasks/types';

const TASK_STATS_CACHE = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
};

/** Never auto-retry expected plan gates (JOV-3861 retry-loop fix). */
function shouldRetryTaskQuery(failureCount: number, error: unknown): boolean {
  if (isTasksUpgradeQueryError(error)) {
    return false;
  }
  return failureCount < 3;
}

function isTasksUpgradeQueryError(error: unknown): boolean {
  return isEntitlementDenialError(error);
}

export function useTasksQuery(
  profileId?: string,
  filters?: TaskFilters,
  options?: { readonly enabled?: boolean }
) {
  const queryFilters = filters ? { ...filters } : undefined;

  return useQuery({
    queryKey: queryKeys.tasks.list(profileId, queryFilters),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTasks(filters),
    ...STANDARD_CACHE,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId) && (options?.enabled ?? true),
    retry: shouldRetryTaskQuery,
  });
}

export function useTaskBoardQuery(
  profileId?: string,
  filters?: Omit<TaskFilters, 'status'>,
  options?: { readonly enabled?: boolean }
) {
  const queryFilters = filters ? { ...filters } : undefined;

  return useQuery({
    queryKey: queryKeys.tasks.board(profileId, queryFilters),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTaskBoard(filters),
    ...STANDARD_CACHE,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId) && (options?.enabled ?? true),
    retry: shouldRetryTaskQuery,
  });
}

export function useTaskQuery(taskId: string | null, profileId?: string) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(taskId ?? 'unknown', profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTask(taskId!),
    ...STANDARD_CACHE,
    enabled: Boolean(taskId && profileId),
    retry: shouldRetryTaskQuery,
  });
}

export function useTaskStatsQuery(
  profileId?: string,
  options?: { readonly enabled?: boolean; readonly seenAt?: string | null }
) {
  return useQuery({
    queryKey: [...queryKeys.tasks.stats(profileId), options?.seenAt ?? null],
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTaskStats({ newerThan: options?.seenAt ?? null }),
    ...TASK_STATS_CACHE,
    enabled: Boolean(profileId) && (options?.enabled ?? true),
    retry: shouldRetryTaskQuery,
  });
}
