import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
  revalidateTag: hoisted.revalidateTag,
  updateTag: hoisted.updateTag,
  refresh: hoisted.refresh,
}));
vi.mock('@/lib/db', () => ({
  db: { select: hoisted.select, update: hoisted.update },
}));
vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireTasksWorkspaceAccess: vi.fn(),
}));
vi.mock('../requireProfileId', () => ({
  requireProfileId: vi.fn().mockResolvedValue('profile-1'),
}));

function ownedTaskSelect(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(rows) }),
    }),
  };
}

describe('task mutations and route revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Tasks are only read through TanStack Query, and the mutation hooks
  // invalidate those queries. A path/tag revalidation here would add a full
  // route re-render to every action response and purge the Router Cache.
  it('deletes a task without re-rendering the route', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    hoisted.select.mockReturnValue(ownedTaskSelect([{ id: 'task-1' }]));
    hoisted.update.mockReturnValue({ set });
    const { deleteTask } = await import('./task-actions');

    await expect(deleteTask('task-1')).resolves.toEqual({ success: true });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) })
    );
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
    expect(hoisted.revalidateTag).not.toHaveBeenCalled();
    expect(hoisted.updateTag).not.toHaveBeenCalled();
    expect(hoisted.refresh).not.toHaveBeenCalled();
  });

  it('still rejects a task the profile does not own', async () => {
    hoisted.select.mockReturnValue(ownedTaskSelect([]));
    const { deleteTask } = await import('./task-actions');

    await expect(deleteTask('task-1')).rejects.toThrow(
      'Task not found or access denied'
    );
    expect(hoisted.update).not.toHaveBeenCalled();
  });
});
