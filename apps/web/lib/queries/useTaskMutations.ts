'use client';

import {
  hashKey,
  notifyManager,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  bulkUpdateTasks,
  createTask,
  deleteTask,
  moveTask,
  updateTask,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import type {
  CreateTaskInput,
  MoveTaskInput,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { queryKeys } from './keys';
import {
  applySavedTask,
  getCachedTaskFromSnapshot,
  getCachedTasks,
  getTaskCacheSnapshot,
  optimisticallyDeleteTask,
  optimisticallyMoveTask,
  optimisticallyUpdateTask,
  restoreTaskCacheSnapshot,
  type TaskCacheSnapshot,
} from './task-mutation-cache';

type TaskQueryClient = ReturnType<typeof useQueryClient>;

let optimisticTaskBatches = new WeakMap<TaskQueryClient, OptimisticTaskBatch>();

function hasPendingTaskMutations(queryClient: TaskQueryClient): boolean {
  return optimisticTaskBatches.has(queryClient);
}

function getCommittedTaskMutationVersion(
  queryClient: TaskQueryClient,
  taskId: string
): number | undefined {
  const snapshot =
    optimisticTaskBatches.get(queryClient)?.base ??
    getTaskCacheSnapshot(queryClient);
  return getCachedTaskFromSnapshot(snapshot, taskId)?.mutationVersion;
}

interface OptimisticTaskBatch {
  base: TaskCacheSnapshot;
  readonly pending: Array<() => void>;
}

interface OptimisticTaskContext {
  readonly batch: OptimisticTaskBatch;
  readonly apply: () => void;
}

function mergeCacheEntries<T>(
  previous: Array<readonly [readonly unknown[], T | undefined]>,
  current: Array<readonly [readonly unknown[], T | undefined]>
): Array<readonly [readonly unknown[], T | undefined]> {
  const known = new Set(previous.map(([key]) => hashKey(key)));
  return [...previous, ...current.filter(([key]) => !known.has(hashKey(key)))];
}

function includeNewTaskCaches(
  base: TaskCacheSnapshot,
  current: TaskCacheSnapshot
): TaskCacheSnapshot {
  return {
    previousLists: mergeCacheEntries(base.previousLists, current.previousLists),
    previousBoards: mergeCacheEntries(
      base.previousBoards,
      current.previousBoards
    ),
    previousDetails: mergeCacheEntries(
      base.previousDetails,
      current.previousDetails
    ),
    previousStatsEntries: mergeCacheEntries(
      base.previousStatsEntries,
      current.previousStatsEntries
    ),
  };
}

function beginOptimisticTaskMutation(
  queryClient: TaskQueryClient,
  apply: () => void
): OptimisticTaskContext {
  const current = getTaskCacheSnapshot(queryClient);
  const batch = optimisticTaskBatches.get(queryClient) ?? {
    base: current,
    pending: [],
  };
  batch.base = includeNewTaskCaches(batch.base, current);
  batch.pending.push(apply);
  optimisticTaskBatches.set(queryClient, batch);
  apply();
  return { batch, apply };
}

/** Rebase remaining contributions instead of restoring another edit's old cache. */
function finishOptimisticTaskMutation(
  queryClient: TaskQueryClient,
  context: OptimisticTaskContext | undefined,
  commit?: () => void
): void {
  if (!context) return;
  const { batch, apply } = context;
  const current = getTaskCacheSnapshot(queryClient);
  const newerRows = getCachedTasks(current).filter(task => {
    const previous = getCachedTaskFromSnapshot(batch.base, task.id);
    return (
      previous && (task.mutationVersion ?? 0) > (previous.mutationVersion ?? 0)
    );
  });
  const index = batch.pending.indexOf(apply);
  if (index === -1) return;
  batch.base = includeNewTaskCaches(batch.base, current);
  batch.pending.splice(index, 1);
  notifyManager.batch(() => {
    restoreTaskCacheSnapshot(queryClient, batch.base);
    for (const task of newerRows) applySavedTask(queryClient, task);
    commit?.();
    batch.base = getTaskCacheSnapshot(queryClient);
    for (const pending of batch.pending) pending();
  });
  if (batch.pending.length === 0) optimisticTaskBatches.delete(queryClient);
}

interface TaskMutationQueue {
  readonly tails: Map<string, Promise<unknown>>;
  readonly versions: Map<string, number>;
}

let taskMutationQueues = new WeakMap<TaskQueryClient, TaskMutationQueue>();

/** Test isolation for the shared, client-scoped in-flight mutations. */
export function resetQueuedTaskUpdatesForTests(): void {
  taskMutationQueues = new WeakMap();
  optimisticTaskBatches = new WeakMap();
}

function getTaskMutationQueue(queryClient: TaskQueryClient): TaskMutationQueue {
  let queue = taskMutationQueues.get(queryClient);
  if (!queue) {
    queue = { tails: new Map(), versions: new Map() };
    taskMutationQueues.set(queryClient, queue);
  }
  return queue;
}

function queuedTaskMutationVersion(
  queryClient: TaskQueryClient,
  taskId: string,
  requested?: number
): number | undefined {
  const cached = getCommittedTaskMutationVersion(queryClient, taskId);
  const expected = requested ?? cached;
  const remembered = getTaskMutationQueue(queryClient).versions.get(taskId);
  if (remembered === undefined) return expected;
  return expected === undefined ? remembered : Math.max(remembered, expected);
}

function rememberTaskMutationVersion(
  queryClient: TaskQueryClient,
  taskId: string,
  version: number | undefined
): void {
  if (version === undefined) return;
  const { tails, versions } = getTaskMutationQueue(queryClient);
  if (!tails.has(taskId)) return;
  versions.set(taskId, Math.max(versions.get(taskId) ?? version, version));
}

/** Reserve every affected ID together so bulk writes cannot overtake edits. */
function enqueueTaskMutation<T>(
  queryClient: TaskQueryClient,
  taskIds: readonly string[],
  run: () => Promise<T>
): Promise<T> {
  const queue = getTaskMutationQueue(queryClient);
  const ids = [...new Set(taskIds)];
  const previous = ids.flatMap(id => {
    const tail = queue.tails.get(id);
    return tail ? [tail] : [];
  });
  const next = Promise.allSettled(previous).then(run);
  for (const id of ids) queue.tails.set(id, next);
  const settle = () => {
    for (const id of ids) {
      if (queue.tails.get(id) === next) {
        queue.tails.delete(id);
        queue.versions.delete(id);
      }
    }
  };
  void next.then(settle, settle);
  return next;
}

async function invalidateTaskQueries(queryClient: TaskQueryClient) {
  // A refetch while another contribution is pending would erase its feedback.
  if (hasPendingTaskMutations(queryClient)) return;
  await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  await queryClient.invalidateQueries({ queryKey: queryKeys.releaseTasks.all });
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaskInput) => createTask(data),
    onSuccess: async () => {
      await invalidateTaskQueries(queryClient);
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      readonly taskId: string;
      readonly data: UpdateTaskInput;
    }) =>
      enqueueTaskMutation(queryClient, [taskId], async () => {
        const saved = await updateTask(taskId, {
          ...data,
          expectedMutationVersion: queuedTaskMutationVersion(
            queryClient,
            taskId,
            data.expectedMutationVersion
          ),
        });
        rememberTaskMutationVersion(queryClient, taskId, saved.mutationVersion);
        return saved;
      }),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const now = new Date();
      return beginOptimisticTaskMutation(queryClient, () =>
        optimisticallyUpdateTask(queryClient, taskId, data, now)
      );
    },
    onSuccess: (saved, _variables, context) => {
      finishOptimisticTaskMutation(queryClient, context, () =>
        applySavedTask(queryClient, saved)
      );
    },
    onError: (_error, _variables, context) =>
      finishOptimisticTaskMutation(queryClient, context),
    onSettled: () => invalidateTaskQueries(queryClient),
  });
}

export function useBulkUpdateTasksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskIds,
      data,
    }: {
      readonly taskIds: string[];
      readonly data: UpdateTaskInput;
    }) =>
      enqueueTaskMutation(queryClient, taskIds, async () => {
        const expectedMutationVersions: Record<string, number> = {};
        for (const id of taskIds) {
          const version = queuedTaskMutationVersion(
            queryClient,
            id,
            data.expectedMutationVersion
          );
          if (version !== undefined) expectedMutationVersions[id] = version;
        }
        const saved = await bulkUpdateTasks(
          taskIds,
          data,
          expectedMutationVersions
        );
        for (const task of saved.affectedTasks)
          rememberTaskMutationVersion(
            queryClient,
            task.id,
            task.mutationVersion
          );
        return saved;
      }),
    onMutate: async ({ taskIds, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const now = new Date();
      return beginOptimisticTaskMutation(queryClient, () => {
        for (const id of new Set(taskIds))
          optimisticallyUpdateTask(queryClient, id, data, now);
      });
    },
    onSuccess: (saved, _variables, context) =>
      finishOptimisticTaskMutation(queryClient, context, () => {
        for (const task of saved.affectedTasks)
          applySavedTask(queryClient, task);
      }),
    onError: (_error, _variables, context) =>
      finishOptimisticTaskMutation(queryClient, context),
    onSettled: () => invalidateTaskQueries(queryClient),
  });
}

export function useMoveTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoveTaskInput) =>
      enqueueTaskMutation(queryClient, [input.taskId], async () => {
        const saved = await moveTask({
          ...input,
          expectedMutationVersion: queuedTaskMutationVersion(
            queryClient,
            input.taskId,
            input.expectedMutationVersion
          ),
        });
        const movingTask = saved.affectedTasks.find(
          task => task.id === input.taskId
        );
        // A sibling may include intervening remote edits. Its new revision
        // updates the cache, but cannot authorize an already queued stale edit.
        rememberTaskMutationVersion(
          queryClient,
          input.taskId,
          movingTask?.mutationVersion
        );
        return saved;
      }),
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const now = new Date();
      return beginOptimisticTaskMutation(queryClient, () =>
        optimisticallyMoveTask(queryClient, input, now)
      );
    },
    onSuccess: (saved, _input, context) =>
      finishOptimisticTaskMutation(queryClient, context, () => {
        for (const task of saved.affectedTasks)
          applySavedTask(queryClient, task);
      }),
    onError: (_error, _input, context) =>
      finishOptimisticTaskMutation(queryClient, context),
    onSettled: () => invalidateTaskQueries(queryClient),
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      enqueueTaskMutation(queryClient, [taskId], () =>
        deleteTask(taskId, queuedTaskMutationVersion(queryClient, taskId))
      ),
    onMutate: async taskId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      return beginOptimisticTaskMutation(queryClient, () =>
        optimisticallyDeleteTask(queryClient, taskId)
      );
    },
    onSuccess: (_saved, taskId, context) =>
      finishOptimisticTaskMutation(queryClient, context, () =>
        optimisticallyDeleteTask(queryClient, taskId)
      ),
    onError: (_error, _taskId, context) =>
      finishOptimisticTaskMutation(queryClient, context),
    onSettled: () => invalidateTaskQueries(queryClient),
  });
}
