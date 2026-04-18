'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getTask,
  getTaskStats,
  getTasks,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { queryKeys, STANDARD_CACHE } from '@/lib/queries';

const TASK_STATS_CACHE = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
};

export function useTasksQuery(profileId?: string) {
  return useQuery({
    queryKey: queryKeys.tasks.list(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTasks(),
    ...STANDARD_CACHE,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useTaskQuery(taskId: string | null, profileId?: string) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(taskId ?? 'unknown', profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTask(taskId!),
    ...STANDARD_CACHE,
    enabled: Boolean(taskId && profileId),
  });
}

export function useTaskStatsQuery(
  profileId?: string,
  options?: { readonly enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.tasks.stats(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => getTaskStats(),
    ...TASK_STATS_CACHE,
    enabled: Boolean(profileId) && (options?.enabled ?? true),
  });
}
