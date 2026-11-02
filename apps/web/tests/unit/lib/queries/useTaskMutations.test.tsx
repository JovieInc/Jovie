import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import {
  resetQueuedTaskUpdatesForTests,
  useMoveTaskMutation,
  useUpdateTaskMutation,
} from '@/lib/queries/useTaskMutations';
import type {
  TaskBoardResult,
  TaskListResult,
  TaskStats,
  TaskStatus,
  TaskView,
  UpdateTaskInput,
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
