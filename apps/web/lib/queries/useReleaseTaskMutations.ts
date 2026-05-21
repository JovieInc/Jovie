'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addReleaseTask,
  deleteReleaseTask,
  instantiateReleaseTasks,
  updateReleaseTask,
} from '@/app/app/(shell)/dashboard/releases/task-actions';
import { captureError } from '@/lib/error-tracking';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { queryKeys } from './keys';

/**
 * Returns true when the error is a TasksUpgradeRequiredError that crossed the
 * Server Action boundary. Matches on the serialised `name` field or the `code`
 * property to avoid a brittle instanceof check across the boundary.
 */
function isUpgradeRequiredError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TasksUpgradeRequiredError') {
    return true;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    ((error as { code: string }).code === 'RELEASE_PLAN_LOCKED' ||
      (error as { code: string }).code === 'TASKS_WORKSPACE_LOCKED')
  ) {
    return true;
  }
  return false;
}

function getReleaseTasksQueryKey(releaseId: string) {
  return queryKeys.releaseTasks.byRelease(releaseId);
}

function restoreReleaseTasksSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: string,
  previous: ReleaseTaskView[] | undefined
) {
  if (previous) {
    queryClient.setQueryData(getReleaseTasksQueryKey(releaseId), previous);
  }
}

async function invalidateReleaseTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: string,
  options: Readonly<{ includeAllReleaseTasks?: boolean }> = {}
) {
  await queryClient.invalidateQueries({
    queryKey: getReleaseTasksQueryKey(releaseId),
  });

  if (options.includeAllReleaseTasks ?? true) {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.releaseTasks.all,
    });
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.tasks.stats(),
  });
}

/**
 * Shared hook for optimistic task toggle (used by both compact and full row).
 */
export function useTaskToggleMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      updateReleaseTask(taskId, {
        status: done ? 'done' : 'todo',
      }),

    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({
        queryKey: getReleaseTasksQueryKey(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        getReleaseTasksQueryKey(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          getReleaseTasksQueryKey(releaseId),
          previous.map(task =>
            task.id === taskId
              ? {
                  ...task,
                  status: done ? ('done' as const) : ('todo' as const),
                  completedAt: done ? new Date() : null,
                }
              : task
          )
        );
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      restoreReleaseTasksSnapshot(queryClient, releaseId, context?.previous);
    },

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useInstantiateTasksMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => instantiateReleaseTasks(releaseId),

    onError: (error: unknown) => {
      // Expected entitlement gate — not a bug, do not report to Sentry.
      if (isUpgradeRequiredError(error)) {
        toast.error(
          'Release plans require a Pro plan. Upgrade to unlock this feature.'
        );
        return;
      }
      captureError('Failed to instantiate release tasks', error, {
        releaseId,
        action: 'instantiate-release-tasks',
      });
      toast.error('Failed to set up release tasks. Try again.');
    },

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useUpdateTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: Parameters<typeof updateReleaseTask>[1];
    }) => updateReleaseTask(taskId, data),

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId, {
        includeAllReleaseTasks: false,
      });
    },
  });
}

export function useAddTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof addReleaseTask>[1]) =>
      addReleaseTask(releaseId, data),

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}

export function useDeleteTaskMutation(releaseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteReleaseTask(taskId),

    onMutate: async taskId => {
      await queryClient.cancelQueries({
        queryKey: getReleaseTasksQueryKey(releaseId),
      });

      const previous = queryClient.getQueryData<ReleaseTaskView[]>(
        getReleaseTasksQueryKey(releaseId)
      );

      if (previous) {
        queryClient.setQueryData(
          getReleaseTasksQueryKey(releaseId),
          previous.filter(task => task.id !== taskId)
        );
      }

      return { previous };
    },

    onError: (_err, _taskId, context) => {
      restoreReleaseTasksSnapshot(queryClient, releaseId, context?.previous);
    },

    onSettled: async () => {
      await invalidateReleaseTaskQueries(queryClient, releaseId);
    },
  });
}
