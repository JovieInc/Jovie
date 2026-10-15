import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import {
  backfillAudienceActionOwners,
  reconcileAudienceActionOwners,
} from './audience-action-owners';

const profileId = '11111111-1111-4111-8111-111111111111';
describe('audience owner backfill bounds', () => {
  it.each([0, -1, 1001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unsafe batch size %s before querying',
    async limit => {
      const execute = vi.fn();
      await expect(
        backfillAudienceActionOwners(
          { execute } as unknown as DbOrTransaction,
          { profileId, limit }
        )
      ).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
  );
  it.each([{ profileId: 'invalid' }, { profileId, cursor: 'invalid' }])(
    'rejects malformed scope/cursor before querying',
    async options => {
      const execute = vi.fn();
      await expect(
        backfillAudienceActionOwners(
          { execute } as unknown as DbOrTransaction,
          options
        )
      ).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
    }
  );
});

describe('audience owner backfill queries', () => {
  const cursor = '22222222-2222-4222-8222-222222222222';

  it.each([
    { input: { profileId }, cursor: null, limit: 100, apply: false },
    {
      input: { profileId, cursor, limit: 1000, apply: true },
      cursor,
      limit: 1000,
      apply: true,
    },
  ])('binds scope, cursor, bounds and write mode: $apply', async options => {
    const batch = {
      scanned: 1,
      updated: Number(options.apply),
      nextCursor: cursor,
    };
    const execute = vi.fn().mockResolvedValue({ rows: [batch] });
    const result = await backfillAudienceActionOwners(
      { execute } as unknown as DbOrTransaction,
      options.input
    );

    expect(result).toEqual(batch);
    expect(execute).toHaveBeenNthCalledWith(1, "SET LOCAL lock_timeout = '5s'");
    expect(execute).toHaveBeenNthCalledWith(
      2,
      "SET LOCAL statement_timeout = '30s'"
    );
    expect(execute).toHaveBeenCalledTimes(3);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[2][0]);
    expect(query.params).toEqual([
      profileId,
      options.cursor,
      options.cursor,
      options.limit,
      options.apply,
    ]);
    expect(query.sql).toContain('m.creator_profile_id = $1::uuid');
    expect(query.sql).toContain('a.id > $3::uuid');
    expect(query.sql).toContain('ORDER BY a.id LIMIT $4');
    expect(query.sql).toContain('a.creator_profile_id IS NULL AND $5');
  });

  it('preserves exact reconciliation counts above Number.MAX_SAFE_INTEGER', async () => {
    const counts = { total: '9007199254740993', missing: '2', mismatched: '1' };
    const execute = vi.fn().mockResolvedValue({ rows: [counts] });
    await expect(
      reconcileAudienceActionOwners(
        { execute } as unknown as DbOrTransaction,
        profileId
      )
    ).resolves.toEqual(counts);
    expect(execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.params).toEqual([profileId]);
    expect(query.sql).toContain('m.creator_profile_id = $1::uuid');
    expect(query.sql).toContain('a.creator_profile_id IS NULL');
    expect(query.sql).toContain('a.creator_profile_id <> m.creator_profile_id');
    expect(query.sql.match(/::text/g)).toHaveLength(3);
  });

  it('rejects invalid reconciliation scope before querying', async () => {
    const execute = vi.fn();
    await expect(
      reconcileAudienceActionOwners(
        { execute } as unknown as DbOrTransaction,
        'invalid'
      )
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates database timeouts without continuing the batch', async () => {
    const error = new Error('lock timeout');
    const execute = vi.fn().mockRejectedValue(error);
    await expect(
      backfillAudienceActionOwners({ execute } as unknown as DbOrTransaction, {
        profileId,
      })
    ).rejects.toThrow(error);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
