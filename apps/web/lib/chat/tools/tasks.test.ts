import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { TaskMutationConflictError } from '@/lib/tasks/errors';

const {
  mockCreateTask,
  mockGetTask,
  mockGetTasks,
  mockUpdateTask,
  mockMoveTask,
  mockInstantiateReleaseTasks,
} = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockGetTask: vi.fn(),
  mockGetTasks: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockMoveTask: vi.fn(),
  mockInstantiateReleaseTasks: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  createTask: mockCreateTask,
  getTask: mockGetTask,
  getTasks: mockGetTasks,
  updateTask: mockUpdateTask,
  moveTask: mockMoveTask,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/task-actions', () => ({
  instantiateReleaseTasks: mockInstantiateReleaseTasks,
}));

import { createManageTasksTool } from './tasks';

const taskId = '00000000-0000-4000-8000-000000000002';
const storedTask = {
  id: taskId,
  title: 'Record the announcement',
  status: 'todo',
  assigneeKind: 'human',
  mutationVersion: 7,
  dueAt: null,
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date('2026-11-26T00:00:00.000Z'),
  updatedAt: new Date('2026-11-26T00:00:00.000Z'),
};

describe('createManageTasksTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the real Tasks workspace route', async () => {
    const tool = createManageTasksTool('profile-id');
    const result = await tool.execute?.({ intent: 'open' }, {} as never);

    expect(result).toMatchObject({
      success: true,
      href: '/app/tasks',
    });
  });

  it('creates a task through the existing task action', async () => {
    const task = {
      id: 'task-id',
      title: 'Pitch Neon Reef to Spotify',
      dueAt: null,
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    };
    mockCreateTask.mockResolvedValue(task);

    const tool = createManageTasksTool('profile-id');
    const result = await tool.execute?.(
      { intent: 'create', title: task.title },
      {} as never
    );

    expect(mockCreateTask).toHaveBeenCalledWith({
      title: task.title,
      status: 'todo',
      priority: 'medium',
    });
    expect(result).toMatchObject({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    });
  });

  it('lists tasks through the existing task action', async () => {
    mockGetTasks.mockResolvedValue({ tasks: [], nextCursor: null });

    const tool = createManageTasksTool('profile-id');
    const result = await tool.execute?.({ intent: 'list' }, {} as never);

    expect(mockGetTasks).toHaveBeenCalledWith({ limit: 20 });
    expect(result).toMatchObject({ success: true, tasks: [] });
  });

  it('sets up a release plan through the existing release task action', async () => {
    mockInstantiateReleaseTasks.mockResolvedValue([
      {
        id: 'task-id',
        title: 'Announce the release',
        dueDate: null,
        completedAt: null,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        updatedAt: new Date('2026-08-05T00:00:00.000Z'),
      },
    ]);

    const releaseId = '00000000-0000-4000-8000-000000000001';
    const tool = createManageTasksTool('profile-id');
    const result = await tool.execute?.(
      { intent: 'release_plan', releaseId },
      {} as never
    );

    expect(mockInstantiateReleaseTasks).toHaveBeenCalledWith(releaseId);
    expect(result).toMatchObject({
      success: true,
      intent: 'release_plan',
      releaseId,
      tasks: [{ id: 'task-id', createdAt: '2026-08-05T00:00:00.000Z' }],
    });
  });

  it('inspects the authoritative task and revision before an agent changes it', async () => {
    mockGetTask.mockResolvedValue(storedTask);
    const result = await createManageTasksTool('profile-id').execute?.(
      { intent: 'get', taskId },
      {} as never
    );
    expect(mockGetTask).toHaveBeenCalledWith(taskId);
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      intent: 'get',
      task: { id: taskId, mutationVersion: 7 },
    });
  });

  it('assigns and schedules through the same revision-checked update as the UI', async () => {
    mockUpdateTask.mockResolvedValue({
      ...storedTask,
      assigneeKind: 'jovie',
      mutationVersion: 8,
    });
    const result = await createManageTasksTool('profile-id').execute?.(
      {
        intent: 'update',
        taskId,
        expectedMutationVersion: 7,
        assigneeKind: 'jovie',
        dueAt: '2026-12-01T18:00:00Z',
      },
      {} as never
    );
    expect(mockUpdateTask).toHaveBeenCalledWith(taskId, {
      expectedMutationVersion: 7,
      assigneeKind: 'jovie',
      dueAt: new Date('2026-12-01T18:00:00Z'),
    });
    expect(result).toMatchObject({
      success: true,
      intent: 'update',
      task: { mutationVersion: 8 },
    });
  });

  it('moves through the atomic action and returns its committed revisions', async () => {
    const affectedTasks = [
      {
        ...storedTask,
        id: taskId,
        mutationVersion: 8,
        status: 'in_progress',
        position: 1024,
        completedAt: null,
        updatedAt: storedTask.updatedAt,
      },
    ];
    mockMoveTask.mockResolvedValue({ success: true, affectedTasks });
    const result = await createManageTasksTool('profile-id').execute?.(
      {
        intent: 'move',
        taskId,
        expectedMutationVersion: 7,
        status: 'in_progress',
      },
      {} as never
    );
    expect(mockMoveTask).toHaveBeenCalledWith({
      taskId,
      expectedMutationVersion: 7,
      toStatus: 'in_progress',
    });
    expect(result).toMatchObject({
      success: true,
      intent: 'move',
      affectedTasks: [
        {
          id: taskId,
          mutationVersion: 8,
          status: 'in_progress',
          updatedAt: '2026-11-26T00:00:00.000Z',
        },
      ],
    });
  });

  it.each(['update', 'move'] as const)(
    'requires a read revision for %s without writing',
    async intent => {
      const result = await createManageTasksTool('profile-id').execute?.(
        { intent, taskId, status: 'done' },
        {} as never
      );
      expect(result).toMatchObject({
        success: false,
        errorCode: 'REQUIRES_INPUT',
        missingFields: ['expectedMutationVersion'],
      });
      expect(mockUpdateTask).not.toHaveBeenCalled();
      expect(mockMoveTask).not.toHaveBeenCalled();
      expect(mockCreateTask).not.toHaveBeenCalled();
    }
  );

  it('keeps execution evidence and arbitrary identity out of the agent input schema', () => {
    const schema = TOOL_SCHEMAS.manageTasks.inputSchema;
    expect(createManageTasksTool('profile-id').inputSchema).toBe(schema);
    for (const field of [
      'agentStatus',
      'agentOutput',
      'completedAt',
      'assigneeUserId',
      'creatorProfileId',
    ]) {
      expect(
        schema.safeParse({
          intent: 'update',
          taskId,
          expectedMutationVersion: 7,
          [field]: 'forged',
        }).success
      ).toBe(false);
    }
  });

  it('returns a stable conflict without rereading and overwriting the new human revision', async () => {
    mockUpdateTask.mockRejectedValue(new TaskMutationConflictError());
    const result = await createManageTasksTool('profile-id').execute?.(
      { intent: 'update', taskId, expectedMutationVersion: 7, status: 'done' },
      {} as never
    );
    expect(result).toMatchObject({
      success: false,
      errorCode: 'CONFLICT',
      retryable: false,
    });
    expect(mockUpdateTask).toHaveBeenCalledTimes(1);
    expect(mockGetTask).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('propagates an uncertain write failure instead of reporting completion', async () => {
    mockMoveTask.mockRejectedValue(new Error('Connection lost during commit'));
    await expect(
      createManageTasksTool('profile-id').execute?.(
        { intent: 'move', taskId, expectedMutationVersion: 7, status: 'done' },
        {} as never
      )
    ).rejects.toThrow('Connection lost during commit');
    expect(mockMoveTask).toHaveBeenCalledTimes(1);
  });

  it('does not create a fallback task when an update has no target or no changes', async () => {
    const execute = createManageTasksTool('profile-id').execute;
    expect(
      await execute?.({ intent: 'update', status: 'done' }, {} as never)
    ).toMatchObject({ success: false, errorCode: 'REQUIRES_INPUT' });
    expect(
      await execute?.(
        { intent: 'update', taskId, expectedMutationVersion: 7 },
        {} as never
      )
    ).toMatchObject({ success: false, errorCode: 'REQUIRES_INPUT' });
    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });
});
