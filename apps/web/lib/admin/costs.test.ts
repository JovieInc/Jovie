import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: mocks.rows }) }),
    }),
    insert: mocks.insert,
  },
}));

import { getAdminCosts } from './costs';

describe('Manual cost reads', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns an empty observation without seeding fictional zero spend', async () => {
    mocks.rows.mockResolvedValue([]);
    await expect(getAdminCosts()).resolves.toEqual([]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('propagates failed reads without writing configuration', async () => {
    mocks.rows.mockRejectedValue(new Error('database unavailable'));
    await expect(getAdminCosts()).rejects.toThrow('database unavailable');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
