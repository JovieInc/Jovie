import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import {
  resetQueuedTaskUpdatesForTests,
  useBulkUpdateTasksMutation,
  useDeleteTaskMutation,
  useMoveTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import type {
  MoveTaskInput,
  MoveTaskResult,
  TaskListResult,
  TaskStatus,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import {
  createMoveResult,
  createTask,
  createTaskBoard,
  createTaskList,
} from './task-mutation-fixtures';

const mockUpdateTask = vi.hoisted(() => vi.fn());
const mockMoveTask = vi.hoisted(() => vi.fn());
const mockDeleteTask = vi.hoisted(() => vi.fn());
const mockBulkUpdateTasks = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  bulkUpdateTasks: mockBulkUpdateTasks,
  createTask: vi.fn(),
  deleteTask: mockDeleteTask,
  moveTask: mockMoveTask,
  updateTask: mockUpdateTask,
}));

describe('useTaskMutationQueue', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    resetQueuedTaskUpdatesForTests();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
        },
        mutations: {
          retry: false,
        },
      },
    });
  });

  it('commits overlapping edits with the version each write advances', async () => {
    let version = 4;
    const seen: Array<number | undefined> = [];
    mockUpdateTask.mockImplementation(
      async (_taskId: string, data: UpdateTaskInput) => {
        seen.push(data.expectedMutationVersion);
        if (data.expectedMutationVersion !== version) {
          throw new Error('Task changed in another session');
        }
        version += 1;
        return createTask({
          mutationVersion: version,
          ...(data.priority === undefined ? {} : { priority: data.priority }),
          ...(data.status === undefined ? {} : { status: data.status }),
          ...(data.assigneeKind === undefined
            ? {}
            : { assigneeKind: data.assigneeKind }),
          ...(data.title === undefined ? {} : { title: data.title }),
        });
      }
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    await act(async () => {
      await Promise.all([
        result.current.mutateAsync({
          taskId: 'task-1',
          data: { priority: 'urgent', expectedMutationVersion: 4 },
        }),
        result.current.mutateAsync({
          taskId: 'task-1',
          data: { assigneeKind: 'jovie', expectedMutationVersion: 4 },
        }),
        result.current.mutateAsync({
          taskId: 'task-1',
          data: {
            title: 'Layout QA task fixture 1',
            status: 'in_progress',
            expectedMutationVersion: 4,
          },
        }),
      ]);
    });

    expect(seen).toEqual([4, 5, 6]);
    expect(version).toBe(7);
  });

  it('commits the debounced title save that lands after a metadata burst settles', async () => {
    // JOV-8793 burst shape: title/status/priority/assignee edits on one board
    // item each capture the same expected version while the previous write is
    // still in flight, and the title editor's debounced save is scheduled
    // later still. The server must see a strictly increasing version chain
    // (no repeated version, no 'Task changed in another session') and the
    // committed row must retain every field, not just the last write.
    let version = 4;
    const seen: Array<number | undefined> = [];
    // TaskView fields are readonly; track the committed patch in a mutable
    // draft and hand copies to the fixture helper.
    const committed = {
      title: 'Layout QA task fixture',
      status: 'backlog' as TaskStatus,
      priority: 'medium' as TaskView['priority'],
      assigneeKind: 'human' as TaskView['assigneeKind'],
    };
    mockUpdateTask.mockImplementation(
      async (_taskId: string, data: UpdateTaskInput) => {
        seen.push(data.expectedMutationVersion);
        if (data.expectedMutationVersion !== version) {
          throw new Error('Task changed in another session');
        }
        version += 1;
        if (data.title !== undefined) committed.title = data.title;
        if (data.status !== undefined) committed.status = data.status;
        if (data.priority !== undefined) committed.priority = data.priority;
        if (data.assigneeKind !== undefined) {
          committed.assigneeKind = data.assigneeKind;
        }
        return createTask({ ...committed, mutationVersion: version });
      }
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    // Metadata writes capture the pre-burst version (4) at schedule time.
    // They run back to back through the queue while the caller is still
    // holding the same capture.
    const priorityWrite = result.current.mutateAsync({
      taskId: 'task-1',
      data: { priority: 'urgent', expectedMutationVersion: 4 },
    });
    const assigneeWrite = result.current.mutateAsync({
      taskId: 'task-1',
      data: { assigneeKind: 'jovie', expectedMutationVersion: 4 },
    });
    const statusWrite = result.current.mutateAsync({
      taskId: 'task-1',
      data: { status: 'in_progress', expectedMutationVersion: 4 },
    });
    await act(async () => {
      await Promise.all([priorityWrite, assigneeWrite, statusWrite]);
    });

    // The queue has now drained and settled (test isolation deletes the
    // remembered version). The debounced title save fires afterwards carrying
    // the version the acknowledged writes committed — it must still land.
    await act(async () => {
      await result.current.mutateAsync({
        taskId: 'task-1',
        data: {
          title: 'Layout QA task fixture 2',
          expectedMutationVersion: 7,
        },
      });
    });

    expect(seen).toEqual([4, 5, 6, 7]);
    expect(committed).toEqual({
      title: 'Layout QA task fixture 2',
      status: 'in_progress',
      priority: 'urgent',
      assigneeKind: 'jovie',
    });
  });

  it('keeps a later optimistic edit when an earlier edit fails', async () => {
    const task = createTask({ mutationVersion: 4 });
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: (value: TaskView) => void;
    mockUpdateTask
      .mockImplementationOnce(
        () =>
          new Promise<TaskView>((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<TaskView>(resolve => {
            resolveSecond = resolve;
          })
      );
    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(task)
    );
    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current
        .mutateAsync({ taskId: task.id, data: { priority: 'urgent' } })
        .catch(error => error);
      second = result.current.mutateAsync({
        taskId: task.id,
        data: { title: 'Keep the newer title' },
      });
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskListResult>(
          queryKeys.tasks.list('profile-1')
        )?.tasks[0]
      ).toMatchObject({ priority: 'urgent', title: 'Keep the newer title' });
    });
    await act(async () => {
      rejectFirst(new Error('first edit failed'));
      await first;
    });
    expect(
      queryClient.getQueryData<TaskListResult>(
        queryKeys.tasks.list('profile-1')
      )?.tasks[0]
    ).toMatchObject({ priority: 'medium', title: 'Keep the newer title' });
    await act(async () => {
      resolveSecond(
        createTask({ title: 'Keep the newer title', mutationVersion: 5 })
      );
      await second;
    });
    expect(
      queryClient.getQueryData<TaskListResult>(
        queryKeys.tasks.list('profile-1')
      )?.tasks[0]?.mutationVersion
    ).toBe(5);
  });

  it('serializes moves, edits, bulk updates and deletion using committed revisions', async () => {
    const task = createTask({ mutationVersion: 4 });
    const other = createTask({
      id: 'task-2',
      position: 1,
      mutationVersion: 10,
    });
    const rows = new Map([
      [task.id, task],
      [other.id, other],
    ]);
    const updateVersions: number[] = [];
    mockUpdateTask.mockImplementation(
      async (id: string, data: UpdateTaskInput) => {
        const previous = rows.get(id)!;
        expect(data.expectedMutationVersion).toBe(previous.mutationVersion);
        updateVersions.push(data.expectedMutationVersion!);
        const saved = createTask({
          ...previous,
          title: data.title,
          mutationVersion: previous.mutationVersion! + 1,
        });
        rows.set(id, saved);
        return saved;
      }
    );
    mockMoveTask.mockImplementation(async (input: MoveTaskInput) => {
      const previous = rows.get(input.taskId)!;
      expect(input.expectedMutationVersion).toBe(5);
      const saved = createTask({
        ...previous,
        status: input.toStatus,
        position: 25,
        mutationVersion: 6,
      });
      rows.set(input.taskId, saved);
      return createMoveResult(saved);
    });
    mockBulkUpdateTasks.mockImplementation(
      async (
        ids: string[],
        data: UpdateTaskInput,
        versions: Record<string, number>
      ) => {
        expect(versions).toEqual({ 'task-1': 6, 'task-2': 10 });
        const affectedTasks = ids.map(id => {
          const previous = rows.get(id)!;
          const saved = createTask({
            ...previous,
            priority: data.priority,
            mutationVersion: previous.mutationVersion! + 1,
          });
          rows.set(id, saved);
          return saved;
        });
        return { success: true, affectedTasks };
      }
    );
    mockDeleteTask.mockImplementation(async (id: string, version: number) => {
      expect(id).toBe(other.id);
      expect(version).toBe(11);
      rows.delete(id);
      return { success: true };
    });
    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(task, other)
    );
    queryClient.setQueryData(
      queryKeys.tasks.board('profile-1'),
      createTaskBoard(task, other)
    );
    queryClient.setQueryData(
      queryKeys.tasks.detail(task.id, 'profile-1'),
      task
    );
    const { result } = renderHook(
      () => ({
        update: useUpdateTaskMutation(),
        move: useMoveTaskMutation(),
        bulk: useBulkUpdateTasksMutation(),
        remove: useDeleteTaskMutation(),
      }),
      { wrapper }
    );
    await act(async () => {
      await Promise.all([
        result.current.update.mutateAsync({
          taskId: task.id,
          data: { title: 'First title', expectedMutationVersion: 4 },
        }),
        result.current.move.mutateAsync({
          taskId: task.id,
          toStatus: 'done',
          expectedMutationVersion: 4,
        }),
        result.current.bulk.mutateAsync({
          taskIds: [task.id, other.id],
          data: { priority: 'urgent' },
        }),
        result.current.remove.mutateAsync(other.id),
        result.current.update.mutateAsync({
          taskId: task.id,
          data: { title: 'Final title', expectedMutationVersion: 4 },
        }),
      ]);
    });
    expect(updateVersions).toEqual([4, 7]);
    expect(
      queryClient.getQueryData<TaskListResult>(
        queryKeys.tasks.list('profile-1')
      )?.tasks
    ).toEqual([
      expect.objectContaining({
        id: task.id,
        title: 'Final title',
        status: 'done',
        priority: 'urgent',
        position: 25,
        mutationVersion: 8,
      }),
    ]);
    expect(
      queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(task.id, 'profile-1')
      )
    ).toMatchObject({ mutationVersion: 8, title: 'Final title' });
  });

  it('does not promote a queued sibling edit to a revision learned from another move', async () => {
    const moving = createTask();
    const sibling = createTask({ id: 'task-2', position: 1 });
    const firstSaved = createTask({
      ...sibling,
      priority: 'high',
      mutationVersion: 2,
    });
    const remoteSaved = createTask({
      ...firstSaved,
      title: 'Remote title',
      description: 'Remote description',
      position: 20,
      mutationVersion: 4,
    });
    const pendingMove = Promise.withResolvers<MoveTaskResult>();
    const pendingConflict = Promise.withResolvers<TaskView>();
    const seen: Array<number | undefined> = [];
    mockMoveTask.mockReturnValue(pendingMove.promise);
    mockUpdateTask.mockImplementation(
      async (_id: string, data: UpdateTaskInput) => {
        seen.push(data.expectedMutationVersion);
        if (seen.length === 1) return firstSaved;
        if (seen.length === 2) return pendingConflict.promise;
        if (data.expectedMutationVersion !== remoteSaved.mutationVersion) {
          throw new Error('Task changed in another session');
        }
        // Adopting the move's sibling revision would make this stale edit valid.
        return createTask({
          ...remoteSaved,
          title: data.title,
          mutationVersion: 5,
        });
      }
    );
    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(moving, sibling)
    );
    const { result } = renderHook(
      () => ({ update: useUpdateTaskMutation(), move: useMoveTaskMutation() }),
      { wrapper }
    );
    let move!: Promise<MoveTaskResult>;
    let writes!: Promise<unknown>[];
    act(() => {
      const first = result.current.update.mutateAsync({
        taskId: sibling.id,
        data: { priority: 'high', expectedMutationVersion: 1 },
      });
      move = result.current.move.mutateAsync({
        taskId: moving.id,
        toStatus: 'done',
      });
      const second = result.current.update
        .mutateAsync({
          taskId: sibling.id,
          data: {
            description: 'Stale description',
            expectedMutationVersion: 1,
          },
        })
        .catch(error => error);
      const third = result.current.update
        .mutateAsync({
          taskId: sibling.id,
          data: { title: sibling.title, expectedMutationVersion: 1 },
        })
        .catch(error => error);
      writes = [first, second, third];
    });
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(2));
    await act(async () => {
      pendingMove.resolve(
        createMoveResult(
          createTask({ ...moving, status: 'done', mutationVersion: 2 }),
          remoteSaved
        )
      );
      await move;
    });
    await act(async () => {
      pendingConflict.reject(new Error('Task changed in another session'));
      await Promise.all(writes);
    });
    expect(seen).toEqual([1, 2, 2]);
    expect(
      queryClient
        .getQueryData<TaskListResult>(queryKeys.tasks.list('profile-1'))
        ?.tasks.find(task => task.id === sibling.id)
    ).toEqual(remoteSaved);
  });
});
