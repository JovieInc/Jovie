import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskMutationConflictError } from '@/lib/tasks/errors';

const mocks = vi.hoisted(() => ({
  tx: { marker: 'trusted-transaction' },
  auth: vi.fn(),
  access: vi.fn(),
  profile: vi.fn(),
  atomic: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  bulk: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  updateTag: mocks.updateTag,
  refresh: mocks.refresh,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: mocks.atomic,
}));
vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireTasksWorkspaceAccess: mocks.access,
}));
vi.mock('../requireProfileId', () => ({ requireProfileId: mocks.profile }));
vi.mock('@/lib/tasks/mutations.server', () => ({
  createTaskInTransaction: mocks.create,
  updateTaskInTransaction: mocks.update,
  moveTaskInTransaction: mocks.move,
  deleteTaskInTransaction: mocks.remove,
  bulkUpdateTasksInTransaction: mocks.bulk,
}));

import {
  bulkUpdateTasks,
  createTask,
  deleteTask,
  moveTask,
} from './task-actions';

describe('task mutation server boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.profile.mockResolvedValue('profile-1');
    mocks.atomic.mockImplementation(
      (operation: (tx: unknown) => Promise<unknown>) => operation(mocks.tx)
    );
  });

  it('deletes through the authenticated atomic scope without re-rendering the route', async () => {
    await expect(deleteTask('task-1', 7)).resolves.toEqual({ success: true });
    expect(mocks.auth).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.atomic).toHaveBeenCalledWith(expect.any(Function), {
      actorId: 'user-1',
      retry: 'serialization',
    });
    expect(mocks.remove).toHaveBeenCalledWith(
      mocks.tx,
      'profile-1',
      'task-1',
      7
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('rejects a missing identity before creating or mutating any task', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(
      createTask({ title: 'Record the announcement' })
    ).rejects.toThrow('Authentication required');
    expect(mocks.atomic).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('preserves access denial before opening a transaction', async () => {
    mocks.access.mockRejectedValue(new Error('Tasks unavailable'));
    await expect(deleteTask('task-1')).rejects.toThrow('Tasks unavailable');
    expect(mocks.atomic).not.toHaveBeenCalled();
  });

  it('surfaces a rejected move once instead of reporting success after conflicts', async () => {
    const conflict = new TaskMutationConflictError();
    mocks.move.mockRejectedValue(conflict);
    await expect(
      moveTask({
        taskId: 'task-1',
        toStatus: 'done',
        expectedMutationVersion: 3,
      })
    ).rejects.toBe(conflict);
    expect(mocks.move).toHaveBeenCalledOnce();
    expect(mocks.atomic).toHaveBeenCalledOnce();
  });

  it('returns the committed move snapshots unchanged', async () => {
    const committed = {
      success: true,
      affectedTasks: [{ id: 'task-1', mutationVersion: 4 }],
    };
    mocks.move.mockResolvedValue(committed);
    await expect(
      moveTask({
        taskId: 'task-1',
        toStatus: 'done',
        expectedMutationVersion: 3,
      })
    ).resolves.toBe(committed);
  });

  it('passes bulk per-task revisions to one atomic operation', async () => {
    mocks.bulk.mockResolvedValue([]);
    await expect(
      bulkUpdateTasks(
        ['task-1', 'task-2'],
        { priority: 'high' },
        { 'task-1': 2, 'task-2': 5 }
      )
    ).resolves.toEqual({ success: true, affectedTasks: [] });
    expect(mocks.atomic).toHaveBeenCalledOnce();
    expect(mocks.bulk).toHaveBeenCalledWith(
      mocks.tx,
      'profile-1',
      ['task-1', 'task-2'],
      { priority: 'high' },
      { 'task-1': 2, 'task-2': 5 }
    );
  });
});
