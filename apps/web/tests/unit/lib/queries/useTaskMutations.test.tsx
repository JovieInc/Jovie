import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries';
import { useUpdateTaskMutation } from '@/lib/queries/useTaskMutations';
import type { TaskListResult, TaskStats, TaskView } from '@/lib/tasks/types';

const mockUpdateTask = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  bulkUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
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
    hasMore: false,
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
});
