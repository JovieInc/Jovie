import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyListAction, createList, type ListAction } from './model';
import type { ListCreator } from './types';

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  creators: vi.fn(),
  pool: vi.fn(),
}));
vi.mock('./list-store.server', () => ({
  readAllLists: mocks.all,
  readList: mocks.read,
  updateList: mocks.update,
}));
vi.mock('./creators.server', () => ({
  getListCreatorsByIds: mocks.creators,
  getCandidatePool: mocks.pool,
}));
const { getListDetail, getSidebarLists, suggestForList } = await import(
  './service.server'
);
const now = '2026-10-04T10:00:00.000Z';
const list = createList({ id: 'one', name: 'Press', now });
const creator = (id: string): ListCreator => ({
  id,
  username: id,
  displayName: id,
  avatarUrl: null,
  genres: ['indie pop'],
  spotifyFollowers: null,
  spotifyPopularity: null,
  location: null,
  activeSinceYear: null,
  isVerified: false,
  isClaimed: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(list);
  mocks.creators.mockResolvedValue([]);
  mocks.pool.mockResolvedValue([]);
});

describe('Ovie list service', () => {
  it('omits unpinned lists and empty smart views from the sidebar', async () => {
    const seeded = applyListAction(
      list,
      { type: 'add', creatorId: 'seed' },
      now
    );
    mocks.all.mockResolvedValue([
      seeded,
      { ...list, id: 'hidden', pinned: false },
    ]);
    const result = await getSidebarLists();
    expect(result.lists).toEqual([
      { id: 'one', name: 'Press', count: 1, pendingSuggestions: 0 },
    ]);
    expect(result.smartViews.map(view => view.id)).toEqual(['unrated']);
  });

  it('returns missing lists without reading creators and preserves detail rows', async () => {
    mocks.read.mockResolvedValueOnce(null);
    await expect(getListDetail('missing')).resolves.toBeNull();
    expect(mocks.creators).not.toHaveBeenCalled();
    mocks.creators.mockResolvedValue([creator('seed')]);
    const result = await getListDetail('one');
    expect(result?.list).toEqual(list);
    expect(result?.creators).toEqual([creator('seed')]);
  });

  it('does not write suggestions for missing lists or insufficient evidence', async () => {
    mocks.read.mockResolvedValueOnce(null);
    await expect(suggestForList('missing')).resolves.toEqual({
      outcome: 'not_found',
    });
    expect(mocks.pool).not.toHaveBeenCalled();
    mocks.pool.mockResolvedValue([creator('candidate')]);
    await expect(suggestForList('one')).resolves.toEqual({
      outcome: 'updated',
      list,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stores explainable candidates as suggestions and preserves a write conflict', async () => {
    const seeded = ['first', 'second'].reduce(
      (current, id) =>
        applyListAction(current, { type: 'add', creatorId: id }, now),
      list
    );
    mocks.read.mockResolvedValue(seeded);
    mocks.creators.mockResolvedValue([creator('first'), creator('second')]);
    mocks.pool.mockResolvedValue([creator('first'), creator('candidate')]);
    mocks.update.mockImplementation(
      async (_id: string, actions: readonly ListAction[]) => ({
        outcome: 'updated',
        list: actions.reduce(
          (current, action) => applyListAction(current, action, now),
          seeded
        ),
      })
    );
    const result = await suggestForList('one');
    expect(result).toMatchObject({
      outcome: 'updated',
      list: {
        members: [
          { creatorId: 'first', state: 'member' },
          { creatorId: 'second', state: 'member' },
          {
            creatorId: 'candidate',
            state: 'suggested',
            suggestionReasons: [expect.any(String), expect.any(String)],
          },
        ],
      },
    });
    expect(mocks.update).toHaveBeenCalledWith('one', [
      {
        type: 'suggest',
        suggestions: [
          {
            creatorId: 'candidate',
            reasons: [expect.any(String), expect.any(String)],
          },
        ],
      },
    ]);
    mocks.update.mockResolvedValueOnce({ outcome: 'conflict' });
    await expect(suggestForList('one')).resolves.toEqual({
      outcome: 'conflict',
    });
  });
});
