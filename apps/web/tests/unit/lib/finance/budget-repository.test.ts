import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  financeBudgetSettings,
  financeBudgetTargets,
  financeTransactions,
} from '@/lib/db/schema/finance';

/**
 * Records every query-builder call so tests can assert the exact owner-scoped
 * predicates and payloads each budget repository function sends.
 */
const recorder = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ method: string; args: unknown[] }>,
    result: [] as unknown[],
  };
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown
          ) => Promise.resolve(state.result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          state.calls.push({ method: String(prop), args });
          return builder;
        };
      },
    }
  );
  return { state, builder };
});

vi.mock('@/lib/db', () => ({ db: recorder.builder }));

const OWNER_A = '11111111-2222-3333-4444-555555555555';
const ACCOUNT_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ACCOUNT_2 = 'BBBBBBBB-CCCC-4DDD-8EEE-FFFFFFFFFFFF';

const dialect = new PgDialect();
const calls = (method: string) =>
  recorder.state.calls.filter(c => c.method === method).map(c => c.args);
const whereSql = () => {
  const { sql, params } = dialect.sqlToQuery(calls('where')[0][0] as SQL);
  return { sql, params };
};

const repo = () => import('@/lib/finance/budget-repository');

describe('budget repository (JOV-4620)', () => {
  beforeEach(() => {
    recorder.state.calls = [];
    recorder.state.result = [];
  });

  describe('budgetMonthBounds', () => {
    it('returns the UTC [start, end) range of a month', async () => {
      const { budgetMonthBounds } = await repo();
      expect(budgetMonthBounds('2026-10')).toEqual({
        start: new Date('2026-10-01T00:00:00.000Z'),
        end: new Date('2026-11-01T00:00:00.000Z'),
      });
      expect(budgetMonthBounds('2026-12')).toEqual({
        start: new Date('2026-12-01T00:00:00.000Z'),
        end: new Date('2027-01-01T00:00:00.000Z'),
      });
    });
  });

  describe('owner validation', () => {
    it.each([
      [
        'listBudgetTargets',
        (r: Awaited<ReturnType<typeof repo>>) =>
          r.listBudgetTargets('creator_42'),
      ],
      [
        'upsertBudgetTarget',
        r =>
          r.upsertBudgetTarget(OWNER_A.slice(0, -1), {
            category: 'creator_income',
            month: 'baseline',
            amount: 100,
          }),
      ],
      [
        'deleteBudgetTarget',
        r =>
          r.deleteBudgetTarget('creator_42', {
            category: 'creator_income',
            month: 'baseline',
          }),
      ],
      ['getBudgetSettings', r => r.getBudgetSettings('creator_42')],
      [
        'upsertBudgetSettings',
        r => r.upsertBudgetSettings('creator_42', { includedAccountIds: null }),
      ],
      [
        'listBudgetMonthTransactions',
        r => r.listBudgetMonthTransactions('creator_42', '2026-10'),
      ],
    ] as const)('%s rejects non-UUID owners before the db', async (_n, run) => {
      await expect(run(await repo())).rejects.toThrow(
        'Invalid financial owner id'
      );
      expect(recorder.state.calls).toEqual([]);
    });
  });

  describe('listBudgetTargets', () => {
    it('returns all of the owner’s targets without a month', async () => {
      const { listBudgetTargets } = await repo();
      recorder.state.result = [{ id: 't1' }];
      await expect(listBudgetTargets(OWNER_A)).resolves.toEqual([{ id: 't1' }]);
      expect(calls('from')).toEqual([[financeBudgetTargets]]);
      expect(whereSql()).toEqual({
        sql: '"finance_budget_targets"."owner_user_id" = $1',
        params: [OWNER_A],
      });
    });

    it('fetches the month overrides plus the baseline for a month', async () => {
      const { listBudgetTargets } = await repo();
      await listBudgetTargets(OWNER_A, '2026-10');
      expect(whereSql()).toEqual({
        sql: '("finance_budget_targets"."owner_user_id" = $1 and "finance_budget_targets"."month" in ($2, $3))',
        params: [OWNER_A, '2026-10', 'baseline'],
      });
    });

    it('rejects an invalid month scope before the db', async () => {
      const { listBudgetTargets } = await repo();
      await expect(listBudgetTargets(OWNER_A, '2026-13')).rejects.toThrow(
        new TypeError('Invalid budget month scope')
      );
      expect(calls('where')).toEqual([]);
    });
  });

  describe('upsertBudgetTarget', () => {
    it('inserts an owner-scoped target and upserts on owner+category+month', async () => {
      const { upsertBudgetTarget } = await repo();
      await upsertBudgetTarget(OWNER_A, {
        category: 'creator_income',
        month: '2026-10',
        amount: '1250.50',
      });
      expect(calls('insert')).toEqual([[financeBudgetTargets]]);
      expect(calls('values')).toEqual([
        [
          {
            ownerUserId: OWNER_A,
            category: 'creator_income',
            month: '2026-10',
            targetAmount: '1250.5',
            updatedAt: expect.any(Date),
          },
        ],
      ]);
      expect(calls('onConflictDoUpdate')).toEqual([
        [
          {
            target: [
              financeBudgetTargets.ownerUserId,
              financeBudgetTargets.category,
              financeBudgetTargets.month,
            ],
            set: { targetAmount: '1250.5', updatedAt: expect.any(Date) },
          },
        ],
      ]);
    });

    it.each([
      [0, '0'],
      [42, '42'],
      ['7', '7'],
    ])('accepts amount %j as %j', async (amount, stored) => {
      const { upsertBudgetTarget } = await repo();
      await upsertBudgetTarget(OWNER_A, {
        category: 'taxes_reserves',
        month: 'baseline',
        amount,
      });
      expect(
        (calls('values')[0][0] as { targetAmount: string }).targetAmount
      ).toBe(stored);
    });

    it.each([
      ['negative', -5],
      ['negative string', '-0.01'],
      ['NaN', Number.NaN],
      ['non-numeric string', 'abc'],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['boolean', true],
      ['null', null],
    ])('rejects a %s amount', async (_label, amount) => {
      const { upsertBudgetTarget } = await repo();
      await expect(
        upsertBudgetTarget(OWNER_A, {
          category: 'creator_income',
          month: 'baseline',
          amount: amount as number,
        })
      ).rejects.toThrow(new TypeError('Invalid target amount'));
      expect(recorder.state.calls).toEqual([]);
    });

    it('rejects invalid categories and months', async () => {
      const { upsertBudgetTarget } = await repo();
      await expect(
        upsertBudgetTarget(OWNER_A, {
          category: 'yachts',
          month: 'baseline',
          amount: 10,
        })
      ).rejects.toThrow(new TypeError('Invalid budget category'));
      await expect(
        upsertBudgetTarget(OWNER_A, {
          category: 'creator_income',
          month: 'October',
          amount: 10,
        })
      ).rejects.toThrow(new TypeError('Invalid budget month scope'));
      expect(recorder.state.calls).toEqual([]);
    });
  });

  describe('deleteBudgetTarget', () => {
    it('deletes only the owner’s category+month row', async () => {
      const { deleteBudgetTarget } = await repo();
      await deleteBudgetTarget(OWNER_A, {
        category: 'creator_operating',
        month: 'baseline',
      });
      expect(calls('delete')).toEqual([[financeBudgetTargets]]);
      expect(whereSql()).toEqual({
        sql: '("finance_budget_targets"."owner_user_id" = $1 and "finance_budget_targets"."category" = $2 and "finance_budget_targets"."month" = $3)',
        params: [OWNER_A, 'creator_operating', 'baseline'],
      });
    });

    it('validates category and month before deleting', async () => {
      const { deleteBudgetTarget } = await repo();
      await expect(
        deleteBudgetTarget(OWNER_A, { category: 'x', month: 'baseline' })
      ).rejects.toThrow(new TypeError('Invalid budget category'));
      await expect(
        deleteBudgetTarget(OWNER_A, {
          category: 'creator_income',
          month: '2026-1',
        })
      ).rejects.toThrow(new TypeError('Invalid budget month scope'));
      expect(recorder.state.calls).toEqual([]);
    });
  });

  describe('budget settings', () => {
    it('reads the owner’s settings row', async () => {
      const { getBudgetSettings } = await repo();
      recorder.state.result = [{ ownerUserId: OWNER_A }];
      await expect(getBudgetSettings(OWNER_A)).resolves.toEqual({
        ownerUserId: OWNER_A,
      });
      expect(calls('from')).toEqual([[financeBudgetSettings]]);
      expect(whereSql()).toEqual({
        sql: '"finance_budget_settings"."owner_user_id" = $1',
        params: [OWNER_A],
      });
      expect(calls('limit')).toEqual([[1]]);
    });

    it('returns null when no settings exist', async () => {
      const { getBudgetSettings } = await repo();
      await expect(getBudgetSettings(OWNER_A)).resolves.toBeNull();
    });

    it('keeps only UUID-shaped account ids and upserts on owner', async () => {
      const { upsertBudgetSettings } = await repo();
      await upsertBudgetSettings(OWNER_A, {
        includedAccountIds: [
          ACCOUNT_1,
          'junk',
          ACCOUNT_2,
          `x${ACCOUNT_1}`,
          `${ACCOUNT_1}x`,
        ],
      });
      expect(calls('insert')).toEqual([[financeBudgetSettings]]);
      expect(calls('values')).toEqual([
        [
          {
            ownerUserId: OWNER_A,
            includedAccountIds: [ACCOUNT_1, ACCOUNT_2],
            updatedAt: expect.any(Date),
          },
        ],
      ]);
      expect(calls('onConflictDoUpdate')).toEqual([
        [
          {
            target: financeBudgetSettings.ownerUserId,
            set: {
              includedAccountIds: [ACCOUNT_1, ACCOUNT_2],
              updatedAt: expect.any(Date),
            },
          },
        ],
      ]);
    });

    it('stores null to include every account', async () => {
      const { upsertBudgetSettings } = await repo();
      await upsertBudgetSettings(OWNER_A, { includedAccountIds: null });
      expect(calls('values')[0][0]).toMatchObject({ includedAccountIds: null });
      expect(calls('onConflictDoUpdate')[0][0]).toMatchObject({
        set: { includedAccountIds: null },
      });
    });
  });

  describe('listBudgetMonthTransactions', () => {
    it('scopes to owner, posted rows, and the UTC month bounds', async () => {
      const { listBudgetMonthTransactions } = await repo();
      recorder.state.result = [{ id: 'tx' }];
      await expect(
        listBudgetMonthTransactions(OWNER_A, '2026-10')
      ).resolves.toEqual([{ id: 'tx' }]);
      expect(calls('from')).toEqual([[financeTransactions]]);
      expect(whereSql()).toEqual({
        sql: '("finance_transactions"."owner_user_id" = $1 and "finance_transactions"."pending" = $2 and "finance_transactions"."occurred_at" >= $3 and "finance_transactions"."occurred_at" < $4)',
        params: [
          OWNER_A,
          'false',
          '2026-10-01T00:00:00.000Z',
          '2026-11-01T00:00:00.000Z',
        ],
      });
    });
  });
});
