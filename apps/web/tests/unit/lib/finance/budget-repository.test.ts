import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const onConflictDoUpdate = vi.fn();
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const delWhere = vi.fn();
  const del = vi.fn(() => ({ where: delWhere }));
  const limit = vi.fn();
  return {
    select,
    from,
    where,
    insert,
    values,
    onConflictDoUpdate,
    del,
    delWhere,
    limit,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    delete: mocks.del,
  },
}));

const OWNER_A = '11111111-2222-3333-4444-555555555555';
const OWNER_B = '99999999-8888-7777-6666-555555555555';

describe('budget repository owner scoping (JOV-4620)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([]);
    mocks.delWhere.mockResolvedValue(undefined);
    mocks.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);
  });

  it('rejects non-UUID owners before touching the db', async () => {
    const { listBudgetTargets } = await import(
      '@/lib/finance/budget-repository'
    );
    await expect(listBudgetTargets('creator_42')).rejects.toThrow(
      'Invalid financial owner id'
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects non-UUID owners on writes', async () => {
    const { upsertBudgetTarget } = await import(
      '@/lib/finance/budget-repository'
    );
    await expect(
      upsertBudgetTarget(OWNER_B.slice(0, -1), {
        category: 'creator_income',
        month: 'baseline',
        amount: 100,
      })
    ).rejects.toThrow('Invalid financial owner id');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid categories, months, and amounts before the db', async () => {
    const { upsertBudgetTarget, deleteBudgetTarget } = await import(
      '@/lib/finance/budget-repository'
    );
    await expect(
      upsertBudgetTarget(OWNER_A, {
        category: 'yachts',
        month: 'baseline',
        amount: 10,
      })
    ).rejects.toThrow('Invalid budget category');
    await expect(
      upsertBudgetTarget(OWNER_A, {
        category: 'creator_income',
        month: 'October',
        amount: 10,
      })
    ).rejects.toThrow('Invalid budget month scope');
    await expect(
      upsertBudgetTarget(OWNER_A, {
        category: 'creator_income',
        month: 'baseline',
        amount: -5,
      })
    ).rejects.toThrow('Invalid target amount');
    await expect(
      deleteBudgetTarget(OWNER_A, { category: 'x', month: 'baseline' })
    ).rejects.toThrow('Invalid budget category');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('scopes month transaction reads to owner and month bounds', async () => {
    const { listBudgetMonthTransactions } = await import(
      '@/lib/finance/budget-repository'
    );
    await listBudgetMonthTransactions(OWNER_A, '2026-10');
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it('upserts settings for the owner only', async () => {
    const { upsertBudgetSettings } = await import(
      '@/lib/finance/budget-repository'
    );
    await upsertBudgetSettings(OWNER_A, {
      includedAccountIds: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'junk'],
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const payload = mocks.values.mock.calls[0][0];
    expect(payload.ownerUserId).toBe(OWNER_A);
    expect(payload.includedAccountIds).toEqual([
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    ]);
  });
});
