import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyListAction, createList } from './model';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  all: vi.fn(),
  insert: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  updated: vi.fn(),
  deleted: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.read, orderBy: mocks.all }),
      }),
    }),
    insert: () => ({ values: mocks.insert }),
    update: () => ({
      set: (values: unknown) => {
        mocks.set(values);
        return {
          where: (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
            mocks.where(new PgDialect().sqlToQuery(condition));
            return { returning: mocks.updated };
          },
        };
      },
    }),
    delete: () => ({ where: () => ({ returning: mocks.deleted }) }),
  },
}));

const { deleteList, insertList, readAllLists, readList, updateList } =
  await import('./list-store.server');
const now = new Date('2026-10-04T10:00:00.000Z');
const list = createList({ id: 'one', name: 'Press', now: now.toISOString() });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue([{ value: list }]);
  mocks.updated.mockResolvedValue([{ key: 'ov-list:one' }]);
});

describe('durable Ovie list writes', () => {
  it('creates a normalized list only after persistence succeeds', async () => {
    const created = await insertList({ name: '  Press   contacts  ', now });
    expect(created.name).toBe('Press contacts');
    expect(mocks.insert).toHaveBeenCalledWith({
      key: `ov-list:${created.id}`,
      value: created,
      updatedAt: now,
    });
    mocks.insert.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(insertList({ name: 'Press', now })).rejects.toThrow(
      'write unavailable'
    );
  });

  it('distinguishes missing and malformed stored records', async () => {
    mocks.read
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { value: { ...list, members: [{ creatorId: 'broken' }] } },
      ]);
    await expect(readList('missing')).resolves.toBeNull();
    await expect(readList('one')).rejects.toThrow('not a valid list');
    mocks.all.mockResolvedValue([{ value: list }, { value: {} }]);
    await expect(readAllLists()).resolves.toEqual([list]);
  });

  it('keeps concurrent edits when a lost CAS retries against the latest record', async () => {
    const other = applyListAction(
      list,
      { type: 'add', creatorId: 'other-tab' },
      new Date(now.getTime() + 1).toISOString()
    );
    mocks.read
      .mockResolvedValueOnce([{ value: list }])
      .mockResolvedValueOnce([{ value: other }]);
    mocks.updated.mockResolvedValueOnce([]);
    const result = await updateList(
      'one',
      [{ type: 'add', creatorId: 'this-tab' }],
      () => now
    );
    expect(result).toMatchObject({
      outcome: 'updated',
      list: {
        members: [{ creatorId: 'other-tab' }, { creatorId: 'this-tab' }],
        updatedAt: new Date(now.getTime() + 2).toISOString(),
      },
    });
    expect(mocks.where.mock.calls.map(([query]) => query.params)).toEqual([
      ['ov-list:one', list.updatedAt],
      ['ov-list:one', other.updatedAt],
    ]);
    expect(mocks.where.mock.calls[1]?.[0].sql).toContain("->>'updatedAt'");
    expect(mocks.set.mock.calls[1]?.[0].value).toEqual(
      result.outcome === 'updated' ? result.list : null
    );
  });

  it('bounds sustained write races and never reports an unpersisted update', async () => {
    mocks.updated.mockResolvedValue([]);
    await expect(
      updateList('one', [{ type: 'rename', name: 'New name' }], () => now)
    ).resolves.toEqual({ outcome: 'conflict' });
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(mocks.updated).toHaveBeenCalledTimes(3);
  });

  it('stops without a write when the list disappears during a retry', async () => {
    mocks.updated.mockResolvedValueOnce([]);
    mocks.read
      .mockResolvedValueOnce([{ value: list }])
      .mockResolvedValueOnce([]);
    await expect(
      updateList('one', [{ type: 'pin', pinned: false }], () => now)
    ).resolves.toEqual({ outcome: 'not_found' });
    expect(mocks.updated).toHaveBeenCalledTimes(1);
  });

  it('propagates model and database failures before reporting success', async () => {
    await expect(
      updateList('one', [{ type: 'rename', name: '' }], () => now)
    ).rejects.toThrow('name is required');
    expect(mocks.updated).not.toHaveBeenCalled();
    mocks.updated.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(
      updateList('one', [{ type: 'pin', pinned: false }], () => now)
    ).rejects.toThrow('write unavailable');
  });

  it('reports deletion only when a stored row was removed', async () => {
    mocks.deleted.mockResolvedValueOnce([{ key: 'ov-list:one' }]);
    mocks.deleted.mockResolvedValueOnce([]);
    await expect(deleteList('one')).resolves.toBe(true);
    await expect(deleteList('one')).resolves.toBe(false);
    mocks.deleted.mockRejectedValueOnce(new Error('delete unavailable'));
    await expect(deleteList('one')).rejects.toThrow('delete unavailable');
  });
});
