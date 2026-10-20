import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db/client/types';
import {
  financeClassificationRules,
  financeTransactionClassifications,
  financeTransactions,
} from '@/lib/db/schema/finance';
import type { ClassificationResult } from '@/lib/finance/classification';

/**
 * Records every query-builder call so tests can assert the exact owner-scoped
 * predicates, payloads, and limits each repository function sends.
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
const ACCOUNT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TX_ID = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee';
const RULE_ID = 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee';

const dialect = new PgDialect();
const calls = (method: string) =>
  recorder.state.calls.filter(c => c.method === method).map(c => c.args);
const methods = () => recorder.state.calls.map(c => c.method);
const render = (fragment: unknown) => {
  const { sql, params } = dialect.sqlToQuery(fragment as SQL);
  return { sql, params };
};
const whereSql = (index = 0) => render(calls('where')[index][0]);

const repo = () => import('@/lib/finance/repository');

const RESULT: ClassificationResult = {
  lens: 'creator_income',
  category: 'royalty',
  confidence: 0.85,
  explanation: 'Royalty or distribution deposit',
  source: 'deterministic',
  ruleId: null,
};

describe('finance repository owner scoping (JOV-4609)', () => {
  beforeEach(() => {
    recorder.state.calls = [];
    recorder.state.result = [];
  });

  it.each([
    [
      'listFinanceInstitutions',
      (r: Awaited<ReturnType<typeof repo>>) =>
        r.listFinanceInstitutions('creator_1'),
    ],
    ['listFinanceAccounts', r => r.listFinanceAccounts('creator_1')],
    ['getFinanceAccount', r => r.getFinanceAccount('creator_1', ACCOUNT_ID)],
    ['listFinanceTransactions', r => r.listFinanceTransactions('creator_1')],
    ['listClassificationRules', r => r.listClassificationRules('creator_1')],
    [
      'createClassificationRule',
      r =>
        r.createClassificationRule('creator_1', {
          name: 'x',
          setLens: 'uncategorized',
        }),
    ],
    [
      'updateClassificationRule',
      r => r.updateClassificationRule('creator_1', RULE_ID, {}),
    ],
    [
      'upsertTransactionClassification',
      r => r.upsertTransactionClassification('creator_1', TX_ID, RESULT),
    ],
    [
      'getTransactionClassification',
      r => r.getTransactionClassification('creator_1', TX_ID),
    ],
    [
      'setTransactionSplits',
      r =>
        r.setTransactionSplits('creator_1', TX_ID, 10, [
          { amount: 10, lens: 'uncategorized' },
        ]),
    ],
    ['listTransactionSplits', r => r.listTransactionSplits('creator_1', TX_ID)],
    [
      'listClassificationReviewQueue',
      r => r.listClassificationReviewQueue('creator_1'),
    ],
  ] as const)(
    '%s rejects non-UUID owners before touching the db',
    async (_name, run) => {
      await expect(run(await repo())).rejects.toThrow(
        'Invalid financial owner id'
      );
      expect(recorder.state.calls).toEqual([]);
    }
  );

  it('lists institutions and accounts filtered by owner only', async () => {
    const { listFinanceInstitutions, listFinanceAccounts } = await repo();
    recorder.state.result = [{ id: 'i1' }];
    await expect(listFinanceInstitutions(OWNER_A)).resolves.toEqual([
      { id: 'i1' },
    ]);
    await listFinanceAccounts(OWNER_A);
    expect(whereSql(0)).toEqual({
      sql: '"finance_institutions"."owner_user_id" = $1',
      params: [OWNER_A],
    });
    expect(whereSql(1)).toEqual({
      sql: '"finance_accounts"."owner_user_id" = $1',
      params: [OWNER_A],
    });
  });

  it('runs overview queries on the supplied session handle instead of the global pool', async () => {
    const client = {
      select: vi.fn().mockReturnValue(recorder.builder),
    };
    const tx = client as unknown as DbOrTransaction;
    const {
      listFinanceInstitutions,
      listFinanceAccounts,
      listFinanceTransactions,
    } = await repo();
    await listFinanceInstitutions(OWNER_A, tx);
    await listFinanceAccounts(OWNER_A, tx);
    await listFinanceTransactions(OWNER_A, { limit: 10000 }, tx);
    expect(client.select).toHaveBeenCalledTimes(3);
    expect(calls('select')).toEqual([]);
    expect(calls('limit')).toEqual([[10000]]);
  });

  it('getFinanceAccount filters by account id and owner and returns the row', async () => {
    const { getFinanceAccount } = await repo();
    recorder.state.result = [{ id: ACCOUNT_ID }];
    await expect(getFinanceAccount(OWNER_A, ACCOUNT_ID)).resolves.toEqual({
      id: ACCOUNT_ID,
    });
    expect(whereSql()).toEqual({
      sql: '("finance_accounts"."id" = $1 and "finance_accounts"."owner_user_id" = $2)',
      params: [ACCOUNT_ID, OWNER_A],
    });
    expect(calls('limit')).toEqual([[1]]);
  });

  it('getFinanceAccount returns null when RLS hides the row', async () => {
    const { getFinanceAccount } = await repo();
    await expect(getFinanceAccount(OWNER_A, ACCOUNT_ID)).resolves.toBeNull();
  });

  it('listFinanceTransactions defaults to owner scope, newest first, 100 rows', async () => {
    const { listFinanceTransactions } = await repo();
    await listFinanceTransactions(OWNER_A);
    expect(whereSql()).toEqual({
      sql: '"finance_transactions"."owner_user_id" = $1',
      params: [OWNER_A],
    });
    expect(render(calls('orderBy')[0][0]).sql).toBe(
      '"finance_transactions"."occurred_at" desc'
    );
    expect(calls('limit')).toEqual([[100]]);
  });

  it('listFinanceTransactions adds the account filter when requested', async () => {
    const { listFinanceTransactions } = await repo();
    await listFinanceTransactions(OWNER_A, { accountId: ACCOUNT_ID, limit: 5 });
    expect(whereSql()).toEqual({
      sql: '("finance_transactions"."owner_user_id" = $1 and "finance_transactions"."account_id" = $2)',
      params: [OWNER_A, ACCOUNT_ID],
    });
    expect(calls('limit')).toEqual([[5]]);
  });

  it('listFinanceTransactions ignores an empty account id', async () => {
    const { listFinanceTransactions } = await repo();
    await listFinanceTransactions(OWNER_A, { accountId: '' });
    expect(whereSql().params).toEqual([OWNER_A]);
  });
});

describe('classification persistence (JOV-4615)', () => {
  beforeEach(() => {
    recorder.state.calls = [];
    recorder.state.result = [];
  });

  it('lists only the owner’s rules', async () => {
    const { listClassificationRules } = await repo();
    recorder.state.result = [{ id: RULE_ID }];
    await expect(listClassificationRules(OWNER_A)).resolves.toEqual([
      { id: RULE_ID },
    ]);
    expect(calls('from')).toEqual([[financeClassificationRules]]);
    expect(whereSql()).toEqual({
      sql: '"finance_classification_rules"."owner_user_id" = $1',
      params: [OWNER_A],
    });
  });

  it('creates rules under the caller, overriding any smuggled owner', async () => {
    const { createClassificationRule } = await repo();
    recorder.state.result = [{ id: RULE_ID }];
    const rule = {
      name: 'Royalties',
      setLens: 'creator_income',
      ownerUserId: '99999999-8888-7777-6666-555555555555',
    };
    await expect(createClassificationRule(OWNER_A, rule)).resolves.toEqual({
      id: RULE_ID,
    });
    expect(calls('insert')).toEqual([[financeClassificationRules]]);
    expect(calls('values')).toEqual([
      [{ name: 'Royalties', setLens: 'creator_income', ownerUserId: OWNER_A }],
    ]);
    expect(methods()).toContain('returning');
  });

  it('updates a rule by id and owner, stamping updatedAt', async () => {
    const { updateClassificationRule } = await repo();
    recorder.state.result = [{ id: RULE_ID, status: 'disabled' }];
    await expect(
      updateClassificationRule(OWNER_A, RULE_ID, { status: 'disabled' })
    ).resolves.toEqual({ id: RULE_ID, status: 'disabled' });
    const [[set]] = calls('set') as [[Record<string, unknown>]];
    expect(set).toEqual({ status: 'disabled', updatedAt: expect.any(Date) });
    expect(whereSql()).toEqual({
      sql: '("finance_classification_rules"."id" = $1 and "finance_classification_rules"."owner_user_id" = $2)',
      params: [RULE_ID, OWNER_A],
    });
  });

  it('returns null when updating a rule the owner cannot see', async () => {
    const { updateClassificationRule } = await repo();
    await expect(
      updateClassificationRule(OWNER_A, RULE_ID, { priority: 1 })
    ).resolves.toBeNull();
  });

  it('upserts a classification idempotently on transaction id', async () => {
    const { upsertTransactionClassification } = await repo();
    recorder.state.result = [{ transactionId: TX_ID }];
    await expect(
      upsertTransactionClassification(OWNER_A, TX_ID, RESULT)
    ).resolves.toEqual({ transactionId: TX_ID });
    expect(calls('insert')).toEqual([[financeTransactionClassifications]]);
    expect(calls('values')).toEqual([
      [
        {
          ownerUserId: OWNER_A,
          transactionId: TX_ID,
          lens: 'creator_income',
          category: 'royalty',
          confidence: '0.85',
          explanation: 'Royalty or distribution deposit',
          source: 'deterministic',
          ruleId: null,
        },
      ],
    ]);
    expect(calls('onConflictDoUpdate')).toEqual([
      [
        {
          target: financeTransactionClassifications.transactionId,
          set: {
            lens: 'creator_income',
            category: 'royalty',
            confidence: '0.85',
            explanation: 'Royalty or distribution deposit',
            source: 'deterministic',
            ruleId: null,
            updatedAt: expect.any(Date),
          },
        },
      ],
    ]);
  });

  it('reads a classification by transaction and owner', async () => {
    const { getTransactionClassification } = await repo();
    await expect(
      getTransactionClassification(OWNER_A, TX_ID)
    ).resolves.toBeNull();
    expect(whereSql()).toEqual({
      sql: '("finance_transaction_classifications"."transaction_id" = $1 and "finance_transaction_classifications"."owner_user_id" = $2)',
      params: [TX_ID, OWNER_A],
    });
    expect(calls('limit')).toEqual([[1]]);
    recorder.state.result = [{ transactionId: TX_ID }];
    await expect(getTransactionClassification(OWNER_A, TX_ID)).resolves.toEqual(
      { transactionId: TX_ID }
    );
  });

  it('rejects unbalanced splits before any delete or insert', async () => {
    const { setTransactionSplits } = await repo();
    await expect(
      setTransactionSplits(OWNER_A, TX_ID, 100, [
        { amount: 60, lens: 'creator_operating_expense' },
      ])
    ).rejects.toThrow(/does not equal/);
    expect(recorder.state.calls).toEqual([]);
  });

  it('replaces splits for the owner’s transaction with sequenced rows', async () => {
    const { setTransactionSplits } = await repo();
    recorder.state.result = [{ seq: 0 }, { seq: 1 }];
    await expect(
      setTransactionSplits(OWNER_A, TX_ID, 100, [
        {
          amount: 60.5,
          lens: 'creator_operating_expense',
          category: 'software',
          note: 'plugin',
        },
        { amount: 39.5, lens: 'personal_discretionary_expense' },
      ])
    ).resolves.toEqual([{ seq: 0 }, { seq: 1 }]);
    expect(methods().indexOf('delete')).toBeLessThan(
      methods().indexOf('insert')
    );
    expect(whereSql()).toEqual({
      sql: '("finance_transaction_splits"."transaction_id" = $1 and "finance_transaction_splits"."owner_user_id" = $2)',
      params: [TX_ID, OWNER_A],
    });
    expect(calls('values')).toEqual([
      [
        [
          {
            ownerUserId: OWNER_A,
            transactionId: TX_ID,
            seq: 0,
            amount: '60.5',
            lens: 'creator_operating_expense',
            category: 'software',
            note: 'plugin',
          },
          {
            ownerUserId: OWNER_A,
            transactionId: TX_ID,
            seq: 1,
            amount: '39.5',
            lens: 'personal_discretionary_expense',
            category: null,
            note: null,
          },
        ],
      ],
    ]);
  });

  it('lists splits by transaction and owner', async () => {
    const { listTransactionSplits } = await repo();
    recorder.state.result = [{ seq: 0 }];
    await expect(listTransactionSplits(OWNER_A, TX_ID)).resolves.toEqual([
      { seq: 0 },
    ]);
    expect(whereSql().params).toEqual([TX_ID, OWNER_A]);
  });

  it('builds the review queue from uncategorized or low-confidence rows', async () => {
    const { listClassificationReviewQueue } = await repo();
    await listClassificationReviewQueue(OWNER_A);
    expect(calls('select')).toEqual([
      [
        {
          classification: financeTransactionClassifications,
          transaction: financeTransactions,
        },
      ],
    ]);
    expect(whereSql()).toEqual({
      sql: '("finance_transaction_classifications"."owner_user_id" = $1 and ("finance_transaction_classifications"."lens" = $2 or "finance_transaction_classifications"."confidence" < $3))',
      params: [OWNER_A, 'uncategorized', '0.6'],
    });
    expect(render(calls('innerJoin')[0][1]).sql).toBe(
      '"finance_transaction_classifications"."transaction_id" = "finance_transactions"."id"'
    );
    expect(calls('limit')).toEqual([[50]]);
  });

  it('honors a custom review threshold and limit', async () => {
    const { listClassificationReviewQueue } = await repo();
    await listClassificationReviewQueue(OWNER_A, {
      confidenceThreshold: 0.8,
      limit: 5,
    });
    expect(whereSql().params).toEqual([OWNER_A, 'uncategorized', '0.8']);
    expect(calls('limit')).toEqual([[5]]);
  });
});
