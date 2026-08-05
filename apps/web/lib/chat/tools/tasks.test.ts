import { describe, expect, it, vi } from 'vitest';

const { mockCreateTask, mockGetTasks } = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockGetTasks: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  createTask: mockCreateTask,
  getTasks: mockGetTasks,
}));

import { createManageTasksTool } from './tasks';

describe('createManageTasksTool', () => {
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
});
