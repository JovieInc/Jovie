import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  clampLimit,
  getNextCursor,
  getPageRows,
  getTaskListWhereClause,
  mapAndDedupeTaskRows,
  readTask,
  readTaskList,
  readTasksByIds,
} from './readers.server';
import type { TaskView } from './types';

const mocks = vi.hoisted(() => ({
  rows: vi.fn<() => Promise<TaskView[]>>(),
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/db', () => {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: (...args: unknown[]) => {
      mocks.where(...args);
      return query;
    },
    orderBy: () => query,
    limit: (count: number) => {
      mocks.limit(count);
      return mocks.rows();
    },
    then: (
      resolve: (rows: TaskView[]) => unknown,
      reject?: (error: unknown) => unknown
    ) => mocks.rows().then(resolve, reject),
  };
  mocks.select.mockReturnValue(query);
  return { db: { select: mocks.select } };
});

const row: TaskView = {
  id: '00000000-0000-4000-8000-000000000001',
  creatorProfileId: 'profile',
  taskNumber: 1,
  title: 'Record release',
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
  position: 1024,
  sourceTemplateId: null,
  metadata: null,
  mutationVersion: 7,
  createdAt: new Date('2026-11-27T00:00:00.000Z'),
  updatedAt: new Date('2026-11-27T00:00:00.000Z'),
};
describe('shared task reader query semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.mockResolvedValue([]);
  });

  it('keeps UI and agent list filters in the same owned active-task query', () => {
    const where = getTaskListWhereClause('owned-profile', {
      search: 'release',
      status: 'todo',
      priority: 'high',
      assigneeKind: 'human',
      releaseId: null,
      cursor: { id: row.id, position: 2048 },
    });
    if (!where) throw new Error('Missing task ownership predicate');
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params).toEqual([
      'owned-profile',
      'todo',
      'high',
      'human',
      '%release%',
      2048,
      2048,
      row.id,
    ]);
    expect(query.sql).toContain('"tasks"."creator_profile_id"');
    expect(query.sql).toContain('"tasks"."deleted_at" is null');
    expect(query.sql).toContain('"tasks"."archived_at" is null');
    expect(query.sql).toContain('"tasks"."release_id" is null');
  });
  it('preserves the complete authoritative revision with mapped content', () => {
    expect(mapAndDedupeTaskRows([row])[0]).toMatchObject({
      id: row.id,
      title: row.title,
      mutationVersion: 7,
      metadata: null,
      releaseTitle: null,
    });
  });
  it('uses a stable position/id cursor without dropping the look-ahead row', () => {
    const rows = [row, { ...row, id: 'next', position: 2048 }];
    expect(getPageRows(rows, 1)).toEqual([row]);
    expect(getNextCursor(rows, 1)).toEqual({ id: row.id, position: 1024 });
    expect(getNextCursor(rows, 2)).toBeNull();
    expect(getNextCursor([], 1)).toBeNull();
    expect(clampLimit()).toBe(50);
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(-2)).toBe(1);
  });

  it('reads an owned task with its complete content and authoritative revision', async () => {
    mocks.rows.mockResolvedValue([row]);
    expect(await readTask(db, 'owned-profile', row.id)).toEqual(row);
    expect(mocks.limit).toHaveBeenCalledWith(1);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([row.id, 'owned-profile']);
    expect(query.sql).toContain('"tasks"."deleted_at" is null');

    mocks.rows.mockResolvedValue([]);
    expect(await readTask(db, 'owned-profile', row.id)).toBeNull();
  });

  it('uses the shared list cursor with one look-ahead row', async () => {
    mocks.rows.mockResolvedValue([
      row,
      { ...row, id: '00000000-0000-4000-8000-000000000002', position: 2048 },
    ]);
    expect(await readTaskList(db, 'owned-profile', { limit: 1 })).toEqual({
      tasks: [row],
      nextCursor: { id: row.id, position: row.position },
    });
    expect(mocks.limit).toHaveBeenCalledWith(2);
  });

  it('reads replay snapshots in one owned active-record query and skips empty batches', async () => {
    expect(await readTasksByIds(db, 'owned-profile', [])).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.rows.mockResolvedValue([row]);
    expect(await readTasksByIds(db, 'owned-profile', [row.id])).toEqual([row]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual(['owned-profile', row.id]);
    expect(query.sql).toContain('"tasks"."deleted_at" is null');
  });
});
