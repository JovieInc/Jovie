import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionType } from '@/lib/db';
import type { Task } from '@/lib/db/schema/tasks';
import {
  bulkUpdateTasksInTransaction,
  deleteTaskInTransaction,
  moveTaskInTransaction,
  updateTaskInTransaction,
} from '@/lib/tasks/mutations.server';

const NOW = new Date('2026-11-26T18:00:00.000Z');
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    creatorProfileId: '00000000-0000-4000-8000-000000000010',
    taskNumber: 1,
    title: 'Record the announcement',
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeKind: 'human',
    assigneeUserId: null,
    agentType: null,
    agentStatus: 'idle',
    agentInput: {},
    agentOutput: {},
    agentError: null,
    releaseId: null,
    conversationId: null,
    parentTaskId: null,
    category: null,
    dueAt: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    position: 1024,
    sourceTemplateId: null,
    metadata: {},
    mutationVersion: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
function query(rows: unknown[]) {
  const result = Promise.resolve(rows);
  const chain = {
    then: result.then.bind(result),
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    innerJoin: () => chain,
  };
  return chain;
}
function fixture() {
  const select = vi.fn();
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    select,
    update,
    set,
    returning,
    tx: { select, update } as unknown as TransactionType,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('task mutation concurrency', () => {
  it('rejects a stale editor revision without writing newer task data', async () => {
    const f = fixture();
    const current = task();
    f.select.mockReturnValue(query([current]));
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        title: 'Stale title',
        expectedMutationVersion: 2,
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('fails closed if a legacy unversioned update loses its server-read comparison', async () => {
    const f = fixture();
    const current = task();
    f.select.mockReturnValue(query([current]));
    f.returning.mockResolvedValue([]);
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        title: 'New title',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.update).toHaveBeenCalledOnce();
  });

  it('returns the actual committed row for a valid update', async () => {
    const f = fixture();
    const current = task();
    const committed = task({ title: 'New title', mutationVersion: 4 });
    f.select.mockReturnValue(query([current]));
    f.returning.mockResolvedValue([committed]);
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        title: 'New title',
        expectedMutationVersion: 3,
      })
    ).resolves.toBe(committed);
  });

  it('rejects a stale move before reading or rewriting sibling order', async () => {
    const f = fixture();
    const current = task();
    f.select.mockReturnValue(query([current]));
    await expect(
      moveTaskInTransaction(f.tx, current.creatorProfileId, {
        taskId: current.id,
        toStatus: 'done',
        expectedMutationVersion: 2,
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.select).toHaveBeenCalledOnce();
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects a partial guarded move so the caller can roll back every changed row', async () => {
    const f = fixture();
    const moving = task();
    const sibling = task({
      id: '00000000-0000-4000-8000-000000000002',
      taskNumber: 2,
      position: 2048,
    });
    f.select
      .mockReturnValueOnce(query([moving]))
      .mockReturnValueOnce(query([moving, sibling]));
    f.returning.mockResolvedValue([{ id: sibling.id, mutationVersion: 4 }]);
    await expect(
      moveTaskInTransaction(f.tx, moving.creatorProfileId, {
        taskId: moving.id,
        toStatus: 'done',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.update).toHaveBeenCalledOnce();
  });

  it('returns complete moving task content for a true no-op without touching siblings', async () => {
    const f = fixture();
    const moving = task({
      description: 'Latest description',
      metadata: { content: 'latest metadata' },
    });
    f.select.mockReturnValue(query([moving]));
    await expect(
      moveTaskInTransaction(f.tx, moving.creatorProfileId, {
        taskId: moving.id,
        toStatus: 'todo',
        expectedMutationVersion: 3,
      })
    ).resolves.toMatchObject({
      success: true,
      affectedTasks: [
        {
          id: moving.id,
          title: moving.title,
          description: moving.description,
          metadata: moving.metadata,
          releaseTitle: null,
          mutationVersion: 3,
          position: 1024,
        },
      ],
    });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects an order anchor that no longer belongs to the destination', async () => {
    const f = fixture();
    const moving = task();
    f.select.mockReturnValue(query([moving]));
    await expect(
      moveTaskInTransaction(f.tx, moving.creatorProfileId, {
        taskId: moving.id,
        toStatus: 'done',
        beforeTaskId: 'missing-anchor',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects stale deletes and stale members of a bulk update before any write', async () => {
    const f = fixture();
    const first = task();
    const second = task({
      id: '00000000-0000-4000-8000-000000000002',
      taskNumber: 2,
      mutationVersion: 5,
    });
    f.select
      .mockReturnValueOnce(query([first]))
      .mockReturnValueOnce(query([first, second]));
    await expect(
      deleteTaskInTransaction(f.tx, first.creatorProfileId, first.id, 2)
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      bulkUpdateTasksInTransaction(
        f.tx,
        first.creatorProfileId,
        [first.id, second.id],
        { priority: 'high' },
        { [first.id]: 3, [second.id]: 4 }
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects a parent outside the profile and a parent cycle', async () => {
    const f = fixture();
    const current = task();
    const child = task({
      id: '00000000-0000-4000-8000-000000000002',
      parentTaskId: current.id,
    });
    f.select
      .mockReturnValueOnce(query([current]))
      .mockReturnValueOnce(query([]));
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        parentTaskId: child.id,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    f.select
      .mockReturnValueOnce(query([current]))
      .mockReturnValueOnce(query([child]));
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        parentTaskId: child.id,
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects an assignee without a live claim on this profile', async () => {
    const f = fixture();
    const current = task();
    f.select
      .mockReturnValueOnce(query([current]))
      .mockReturnValueOnce(query([]));
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        assigneeUserId: 'someone-else',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects invalid task fields before querying persistence', async () => {
    const f = fixture();
    const current = task();
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        title: ' ',
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      updateTaskInTransaction(f.tx, current.creatorProfileId, current.id, {
        dueAt: new Date('invalid'),
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(f.select).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
});
