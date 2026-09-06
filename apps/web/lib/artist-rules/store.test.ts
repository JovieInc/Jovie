import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const updateResults: unknown[][] = [];
  const insertValues: unknown[] = [];
  const updateSets: unknown[] = [];

  function nextResult(queue: unknown[][]): Promise<unknown[]> {
    return Promise.resolve(queue.shift() ?? []);
  }

  function makeSelectResult() {
    return {
      limit: vi.fn(() => nextResult(selectResults)),
      orderBy: vi.fn(() => nextResult(selectResults)),
      then<TResult1 = unknown[], TResult2 = never>(
        onfulfilled?:
          | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ): Promise<TResult1 | TResult2> {
        return nextResult(selectResults).then(onfulfilled, onrejected);
      },
    };
  }

  function makeUpdateResult() {
    return {
      returning: vi.fn(() => nextResult(updateResults)),
      then<TResult1 = unknown[], TResult2 = never>(
        onfulfilled?:
          | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ): Promise<TResult1 | TResult2> {
        return nextResult(updateResults).then(onfulfilled, onrejected);
      },
    };
  }

  const db = {
    transaction: vi.fn(),
    select: vi.fn((_selection?: unknown) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => makeSelectResult()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        insertValues.push(values);
        return {
          returning: vi.fn(() => nextResult(insertResults)),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updateSets.push(values);
        return {
          where: vi.fn(() => makeUpdateResult()),
        };
      }),
    })),
  };

  return {
    db,
    insertResults,
    insertValues,
    selectResults,
    updateResults,
    updateSets,
    reset: () => {
      selectResults.length = 0;
      insertResults.length = 0;
      updateResults.length = 0;
      insertValues.length = 0;
      updateSets.length = 0;
      vi.clearAllMocks();
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));

import {
  activateSuggestedArtistRule,
  createConfirmedArtistRule,
} from './store';

const creatorProfileId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-08-28T00:00:00.000Z');

function artistRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    creatorProfileId,
    category: 'voice',
    ruleKey: 'casing',
    instruction: 'use lowercase',
    strength: 'hard_constraint',
    scope: 'artist',
    scopeValue: null,
    allowOverride: false,
    status: 'active',
    provenance: {
      source: 'artist',
      capturedAt: createdAt.toISOString(),
    },
    confirmedBy: actorUserId,
    confirmedAt: createdAt,
    effectiveAt: createdAt,
    expiresAt: null,
    supersedesRuleId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('artist rules store', () => {
  beforeEach(() => {
    mocks.reset();
  });

  it('creates a confirmed rule and supersedes pre-existing active rules without a transaction', async () => {
    mocks.selectResults.push([{ id: 'old-rule' }]);
    mocks.insertResults.push([
      artistRule({ id: 'new-rule', supersedesRuleId: 'old-rule' }),
    ]);

    const result = await createConfirmedArtistRule({
      creatorProfileId,
      actorUserId,
      category: 'voice',
      ruleKey: 'casing',
      instruction: 'use lowercase',
      strength: 'hard_constraint',
      allowOverride: false,
    });

    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.insertValues[0]).toEqual(
      expect.objectContaining({
        creatorProfileId,
        confirmedBy: actorUserId,
        status: 'active',
        supersedesRuleId: 'old-rule',
      })
    );
    expect(mocks.updateSets).toContainEqual(
      expect.objectContaining({ status: 'superseded' })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'new-rule',
        provenanceSource: 'artist',
        createdAt: createdAt.toISOString(),
      })
    );
  });

  it('activates a suggested rule before superseding previously active rules', async () => {
    mocks.selectResults.push(
      [artistRule({ id: 'suggested-rule', status: 'suggested' })],
      [{ id: 'old-rule' }]
    );
    mocks.updateResults.push([
      artistRule({ id: 'suggested-rule', status: 'active' }),
    ]);

    const result = await activateSuggestedArtistRule({
      creatorProfileId,
      ruleId: 'suggested-rule',
      actorUserId,
    });

    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.updateSets[0]).toEqual(
      expect.objectContaining({
        status: 'active',
        confirmedBy: actorUserId,
      })
    );
    expect(mocks.updateSets[1]).toEqual(
      expect.objectContaining({ status: 'superseded' })
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'suggested-rule', status: 'active' })
    );
  });

  it('does not supersede active rules when suggested activation loses the CAS race', async () => {
    mocks.selectResults.push(
      [artistRule({ id: 'suggested-rule', status: 'suggested' })],
      [{ id: 'old-rule' }]
    );
    mocks.updateResults.push([]);

    const result = await activateSuggestedArtistRule({
      creatorProfileId,
      ruleId: 'suggested-rule',
      actorUserId,
    });

    expect(result).toBeNull();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.updateSets).toHaveLength(1);
  });
});
