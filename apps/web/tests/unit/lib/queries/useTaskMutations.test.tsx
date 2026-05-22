import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import {
  useMoveTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import type {
  TaskBoardResult,
  TaskListResult,
  TaskStats,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';

const mockUpdateTask = vi.hoisted(() => vi.fn());
const mockMoveTask = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  bulkUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  moveTask: mockMoveTask,
  updateTask: mockUpdateTask,
}));

function createTask(overrides: Partial<TaskView> = {}): TaskView {
  const now = new Date('2026-03-30T12:00:00.000Z');

  return {
    id: 'task-1',
    taskNumber: 12,
    creatorProfileId: 'profile-1',
    title: 'Update artist bio',
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeKind: 'human',
    assigneeUserId: null,
    agentType: null,
    agentStatus: 'idle',
    agentInput: null,
    agentOutput: null,
    agentError: null,
    releaseId: null,
    releaseTitle: null,
    parentTaskId: null,
    category: null,
    dueAt: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    position: 0,
    sourceTemplateId: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTaskList(task: TaskView): TaskListResult {
  return {
    tasks: [task],
    nextCursor: null,
  };
}

function createTaskBoard(task: TaskView): TaskBoardResult {
  const statuses: TaskStatus[] = [
    'backlog',
    'todo',
    'in_progress',
    'done',
    'cancelled',
  ];

  return {
    columns: statuses.map(status => {
      const tasks = task.status === status ? [task] : [];
      return {
        status,
        tasks,
        totalCount: tasks.length,
        nextCursor: null,
      };
    }),
    totalCount: 1,
  };
}

function createTaskStats(): TaskStats {
  return {
    backlog: 0,
    todo: 1,
    inProgress: 0,
    done: 0,
    cancelled: 0,
    activeTodoCount: 1,
  };
}

describe('useTaskMutations', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
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
      });
    });

    await act(async () => {
      resolveUpdate(createTask({ status: 'done', completedAt: new Date() }));
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
      resolveUpdate(createTask({ status: 'done', completedAt: new Date() }));
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
      let resolveMoveTask!: (value: { success: true }) => void;

      mockMoveTask.mockImplementation(
        () =>
          new Promise<{ success: true }>(resolve => {
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
        resolveMoveTask({ success: true });
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

    it('does not surface an error to the caller when moveTask succeeds silently after retries', async () => {
      const task = createTask({ status: 'todo' });

      // Server action returns success even after internal retries — no throw.
      mockMoveTask.mockResolvedValue({ success: true });

      queryClient.setQueryData(
        queryKeys.tasks.board('profile-1'),
        createTaskBoard(task)
      );

      const { result } = renderHook(() => useMoveTaskMutation(), { wrapper });

      act(() => {
        result.current.mutate({ taskId: task.id, toStatus: 'in_progress' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // No error should have been set.
      expect(result.current.error).toBeNull();
    });
  });
});
