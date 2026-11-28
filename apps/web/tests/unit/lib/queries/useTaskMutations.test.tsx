import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import {
  resetQueuedTaskUpdatesForTests,
  useDeleteTaskMutation,
  useMoveTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import type {
  MoveTaskResult,
  TaskBoardResult,
  TaskListResult,
  TaskStats,
  TaskView,
} from '@/lib/tasks/types';

import {
  createMoveResult,
  createTask,
  createTaskBoard,
  createTaskList,
  createTaskStats,
} from './task-mutation-fixtures';

const mockUpdateTask = vi.hoisted(() => vi.fn());
const mockMoveTask = vi.hoisted(() => vi.fn());
const mockDeleteTask = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  bulkUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: mockDeleteTask,
  moveTask: mockMoveTask,
  updateTask: mockUpdateTask,
}));

describe('useTaskMutations', () => {
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

  it.each(['move', 'delete'] as const)(
    'preserves a different task commit when a %s fails',
    async kind => {
      const task = createTask();
      const other = createTask({ id: 'task-2', position: 1 });
      const failure = Promise.withResolvers<never>();
      mockMoveTask.mockReturnValue(failure.promise);
      mockDeleteTask.mockReturnValue(failure.promise);
      mockUpdateTask.mockResolvedValue(
        createTask({
          ...other,
          title: 'Saved independently',
          mutationVersion: 2,
        })
      );
      queryClient.setQueryData(
        queryKeys.tasks.list('profile-1'),
        createTaskList(task, other)
      );
      queryClient.setQueryData(
        queryKeys.tasks.board('profile-1'),
        createTaskBoard(task, other)
      );
      queryClient.setQueryData(
        queryKeys.tasks.stats('profile-1'),
        createTaskStats({ todo: 2, activeTodoCount: 2 })
      );
      queryClient.setQueryData(
        queryKeys.tasks.stats('profile-2'),
        createTaskStats({ todo: 9, activeTodoCount: 9 })
      );
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(
        () => ({
          update: useUpdateTaskMutation(),
          move: useMoveTaskMutation(),
          remove: useDeleteTaskMutation(),
        }),
        { wrapper }
      );
      let pending!: Promise<unknown>;
      act(() => {
        pending = (
          kind === 'move'
            ? result.current.move.mutateAsync({
                taskId: task.id,
                toStatus: 'done',
              })
            : result.current.remove.mutateAsync(task.id)
        ).catch(error => error);
      });
      await waitFor(() =>
        expect(
          kind === 'move' ? mockMoveTask : mockDeleteTask
        ).toHaveBeenCalledOnce()
      );
      await act(async () => {
        await result.current.update.mutateAsync({
          taskId: other.id,
          data: { title: 'Saved independently' },
        });
      });
      expect(invalidate).not.toHaveBeenCalled();
      await act(async () => {
        failure.reject(new Error('stale task revision'));
        await pending;
      });
      expect(
        queryClient.getQueryData<TaskListResult>(
          queryKeys.tasks.list('profile-1')
        )?.tasks
      ).toEqual([
        task,
        expect.objectContaining({
          id: other.id,
          title: 'Saved independently',
          mutationVersion: 2,
        }),
      ]);
      expect(
        queryClient
          .getQueryData<TaskBoardResult>(queryKeys.tasks.board('profile-1'))
          ?.columns.find(column => column.status === 'todo')
      ).toMatchObject({ totalCount: 2 });
      expect(
        queryClient.getQueryData<TaskStats>(queryKeys.tasks.stats('profile-1'))
      ).toEqual(createTaskStats({ todo: 2, activeTodoCount: 2 }));
      expect(
        queryClient.getQueryData<TaskStats>(queryKeys.tasks.stats('profile-2'))
      ).toEqual(createTaskStats({ todo: 9, activeTodoCount: 9 }));
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.tasks.all,
      });
    }
  );

  it('applies authoritative move revisions to every affected cached row', async () => {
    const task = createTask({ mutationVersion: 4 });
    const other = createTask({ id: 'task-2', position: 1, mutationVersion: 8 });
    const completedAt = new Date('2026-03-30T14:00:00.000Z');
    const saved = createTask({
      ...task,
      status: 'done',
      position: 50,
      mutationVersion: 5,
      completedAt,
      updatedAt: completedAt,
    });
    const reordered = createTask({
      ...other,
      title: 'A collaborator updated this title',
      description: 'Preserve their latest description',
      position: 20,
      mutationVersion: 9,
      updatedAt: completedAt,
    });
    mockMoveTask.mockResolvedValue(createMoveResult(saved, reordered));
    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(task, other)
    );
    queryClient.setQueryData(
      queryKeys.tasks.board('profile-1'),
      createTaskBoard(task, other)
    );
    queryClient.setQueryData(
      queryKeys.tasks.detail(other.id, 'profile-1'),
      other
    );
    const { result } = renderHook(() => useMoveTaskMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ taskId: task.id, toStatus: 'done' });
    });
    expect(mockMoveTask).toHaveBeenCalledWith({
      taskId: task.id,
      toStatus: 'done',
      expectedMutationVersion: 4,
    });
    expect(
      queryClient.getQueryData<TaskListResult>(
        queryKeys.tasks.list('profile-1')
      )?.tasks
    ).toEqual([reordered, saved]);
    expect(
      queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(other.id, 'profile-1')
      )
    ).toEqual(reordered);
    expect(
      queryClient
        .getQueryData<TaskBoardResult>(queryKeys.tasks.board('profile-1'))
        ?.columns.find(column => column.status === 'done')?.tasks
    ).toEqual([saved]);
  });

  it('reorders a cached list by board order when status changes', async () => {
    const later = createTask({
      id: 'task-later',
      title: 'Later',
      position: 10,
      status: 'todo',
    });
    const earlier = createTask({
      id: 'task-earlier',
      title: 'Earlier',
      position: 0,
      status: 'todo',
    });
    mockUpdateTask.mockResolvedValue(
      createTask({ id: later.id, status: 'done' })
    );

    queryClient.setQueryData(queryKeys.tasks.list('profile-1'), {
      tasks: [later, earlier],
      nextCursor: null,
    } satisfies TaskListResult);

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: later.id,
        data: { status: 'done' },
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TaskListResult>(
        queryKeys.tasks.list('profile-1')
      );
      expect(cached?.tasks.map(task => task.id)).toEqual([
        earlier.id,
        later.id,
      ]);
    });
  });

  it('updates profile-scoped stats optimistically from the cached task list', async () => {
    const task = createTask();
    let resolveUpdate!: (value: TaskView) => void;

    mockUpdateTask.mockImplementation(
      () =>
        new Promise<TaskView>(resolve => {
          resolveUpdate = resolve;
        })
    );

    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(task)
    );
    queryClient.setQueryData(
      queryKeys.tasks.stats('profile-1'),
      createTaskStats()
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        data: { status: 'done' },
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskStats>(queryKeys.tasks.stats('profile-1'))
      ).toEqual({
        backlog: 0,
        todo: 0,
        inProgress: 0,
        done: 1,
        cancelled: 0,
        activeTodoCount: 0,
        newActiveTodoCount: 0,
      });
    });

    await act(async () => {
      resolveUpdate(
        createTask({
          status: 'done',
          completedAt: new Date('2026-03-30T13:00:00.000Z'),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('updates profile-scoped detail caches optimistically', async () => {
    const task = createTask();
    let resolveUpdate!: (value: TaskView) => void;

    mockUpdateTask.mockImplementation(
      () =>
        new Promise<TaskView>(resolve => {
          resolveUpdate = resolve;
        })
    );

    queryClient.setQueryData(
      queryKeys.tasks.detail(task.id, 'profile-1'),
      task
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        data: { status: 'done' },
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskView>(
          queryKeys.tasks.detail(task.id, 'profile-1')
        )
      ).toMatchObject({
        id: task.id,
        status: 'done',
      });
    });

    const optimisticDetail = queryClient.getQueryData<TaskView>(
      queryKeys.tasks.detail(task.id, 'profile-1')
    );

    expect(optimisticDetail).toMatchObject({
      id: task.id,
      status: 'done',
    });
    expect(optimisticDetail?.completedAt).toBeInstanceOf(Date);

    await act(async () => {
      resolveUpdate(
        createTask({
          status: 'done',
          completedAt: new Date('2026-03-30T13:00:00.000Z'),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('moves and patches board cards optimistically when status and metadata change together', async () => {
    const task = createTask({
      status: 'backlog',
      priority: 'high',
      assigneeKind: 'human',
    });
    let resolveUpdate!: (value: TaskView) => void;

    mockUpdateTask.mockImplementation(
      () =>
        new Promise<TaskView>(resolve => {
          resolveUpdate = resolve;
        })
    );

    queryClient.setQueryData(
      queryKeys.tasks.board('profile-1'),
      createTaskBoard(task)
    );
    queryClient.setQueryData(
      queryKeys.tasks.list('profile-1'),
      createTaskList(task)
    );
    queryClient.setQueryData(
      queryKeys.tasks.detail(task.id, 'profile-1'),
      task
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        data: {
          status: 'in_progress',
          priority: 'urgent',
          assigneeKind: 'jovie',
        },
      });
    });

    await waitFor(() => {
      const board = queryClient.getQueryData<TaskBoardResult>(
        queryKeys.tasks.board('profile-1')
      );
      const backlogTasks =
        board?.columns.find(column => column.status === 'backlog')?.tasks ?? [];
      const inProgressTask = board?.columns
        .find(column => column.status === 'in_progress')
        ?.tasks.find(candidate => candidate.id === task.id);

      expect(backlogTasks).toEqual([]);
      expect(inProgressTask).toMatchObject({
        id: task.id,
        status: 'in_progress',
        priority: 'urgent',
        assigneeKind: 'jovie',
      });
    });

    expect(
      queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(task.id, 'profile-1')
      )
    ).toMatchObject({
      status: 'in_progress',
      priority: 'urgent',
      assigneeKind: 'jovie',
    });

    expect(
      queryClient
        .getQueryData<TaskListResult>(queryKeys.tasks.list('profile-1'))
        ?.tasks.at(0)
    ).toMatchObject({
      status: 'in_progress',
      priority: 'urgent',
      assigneeKind: 'jovie',
    });

    await act(async () => {
      resolveUpdate(
        createTask({
          status: 'in_progress',
          priority: 'urgent',
          assigneeKind: 'jovie',
          completedAt: null,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('rolls back optimistic board item edits when the update fails', async () => {
    const task = createTask({
      status: 'todo',
      priority: 'medium',
      assigneeKind: 'human',
    });
    const previousBoard = createTaskBoard(task);
    let rejectUpdate!: (error: Error) => void;

    mockUpdateTask.mockImplementation(
      () =>
        new Promise<TaskView>((_resolve, reject) => {
          rejectUpdate = reject;
        })
    );

    queryClient.setQueryData(queryKeys.tasks.board('profile-1'), previousBoard);
    queryClient.setQueryData(
      queryKeys.tasks.detail(task.id, 'profile-1'),
      task
    );

    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper });

    act(() => {
      result.current.mutate({
        taskId: task.id,
        data: {
          priority: 'urgent',
          assigneeKind: 'jovie',
        },
      });
    });

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<TaskBoardResult>(queryKeys.tasks.board('profile-1'))
          ?.columns.find(column => column.status === 'todo')
          ?.tasks.at(0)
      ).toMatchObject({
        priority: 'urgent',
        assigneeKind: 'jovie',
      });
    });

    await act(async () => {
      rejectUpdate(new Error('update failed'));
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(
      queryClient.getQueryData<TaskBoardResult>(
        queryKeys.tasks.board('profile-1')
      )
    ).toEqual(previousBoard);
    expect(
      queryClient.getQueryData<TaskView>(
        queryKeys.tasks.detail(task.id, 'profile-1')
      )
    ).toEqual(task);
  });

  describe('useMoveTaskMutation', () => {
    it('applies board move optimistically and settles on success', async () => {
      const task = createTask({ status: 'todo' });
      let resolveMoveTask!: (value: MoveTaskResult) => void;

      mockMoveTask.mockImplementation(
        () =>
          new Promise<MoveTaskResult>(resolve => {
            resolveMoveTask = resolve;
          })
      );

      queryClient.setQueryData(
        queryKeys.tasks.board('profile-1'),
        createTaskBoard(task)
      );

      const { result } = renderHook(() => useMoveTaskMutation(), { wrapper });

      act(() => {
        result.current.mutate({ taskId: task.id, toStatus: 'done' });
      });

      // Optimistic: task should appear in the 'done' column immediately.
      await waitFor(() => {
        const board = queryClient.getQueryData<TaskBoardResult>(
          queryKeys.tasks.board('profile-1')
        );
        const doneTask = board?.columns
          .find(c => c.status === 'done')
          ?.tasks.find(t => t.id === task.id);
        expect(doneTask).toBeDefined();
      });

      await act(async () => {
        resolveMoveTask(
          createMoveResult(createTask({ status: 'done', mutationVersion: 2 }))
        );
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('rolls back board optimistic move when the server action fails', async () => {
      const task = createTask({ status: 'todo' });
      const previousBoard = createTaskBoard(task);
      let rejectMoveTask!: (error: Error) => void;

      mockMoveTask.mockImplementation(
        () =>
          new Promise<{ success: true }>((_resolve, reject) => {
            rejectMoveTask = reject;
          })
      );

      queryClient.setQueryData(
        queryKeys.tasks.board('profile-1'),
        previousBoard
      );

      const { result } = renderHook(() => useMoveTaskMutation(), { wrapper });

      act(() => {
        result.current.mutate({ taskId: task.id, toStatus: 'done' });
      });

      // Wait for optimistic patch to be applied.
      await waitFor(() => {
        const board = queryClient.getQueryData<TaskBoardResult>(
          queryKeys.tasks.board('profile-1')
        );
        const doneTask = board?.columns
          .find(c => c.status === 'done')
          ?.tasks.find(t => t.id === task.id);
        expect(doneTask).toBeDefined();
      });

      await act(async () => {
        rejectMoveTask(new Error('server conflict'));
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Rollback: original board state should be restored.
      expect(
        queryClient.getQueryData<TaskBoardResult>(
          queryKeys.tasks.board('profile-1')
        )
      ).toEqual(previousBoard);
    });

    it('reports a conflicting move and restores the committed board', async () => {
      const task = createTask({ status: 'todo' });
      const conflict = new Error('Task changed in another session');
      mockMoveTask.mockRejectedValue(conflict);

      queryClient.setQueryData(
        queryKeys.tasks.board('profile-1'),
        createTaskBoard(task)
      );

      const { result } = renderHook(() => useMoveTaskMutation(), { wrapper });

      act(() => {
        result.current.mutate({ taskId: task.id, toStatus: 'in_progress' });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(conflict);
      expect(
        queryClient.getQueryData(queryKeys.tasks.board('profile-1'))
      ).toEqual(createTaskBoard(task));
    });
  });
});
