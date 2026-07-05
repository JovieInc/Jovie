import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

import {
  findMerchCardIdsForRelease,
  mergeStoreListingMerchCardIds,
  normalizeStoreListing,
  resolveMerchCardIdsForRun,
} from './store-listing';
import type { ReleaseToRevenueRunStepOutputs } from './types';

const dialect = new PgDialect();

interface MerchBatchRow {
  readonly merchCardId: string | null;
  readonly creatorProfileId: string;
}

/**
 * Fake `merch_generation_batches` query that faithfully applies the rendered
 * WHERE predicate to a two-tenant fixture, and records the SQL so a test can
 * assert the owner predicate is present.
 */
function fakeBatchSelect(rows: readonly MerchBatchRow[]) {
  let captured: { sql: string; params: unknown[] } | null = null;
  const chain = {
    from: () => chain,
    where: (cond: unknown) => {
      const q = dialect.sqlToQuery(cond as never);
      captured = { sql: q.sql, params: q.params };
      const params = q.params as unknown[];
      // Predicate shape: creator_profile_id = $1 AND command = $2 AND prompt LIKE $3 AND selected IS NOT NULL.
      // Owner scoping requires the row's creator to be one of the bound params.
      const matching = rows.filter(
        row => row.merchCardId !== null && params.includes(row.creatorProfileId)
      );
      return Promise.resolve(
        matching.map(row => ({ merchCardId: row.merchCardId }))
      );
    },
  };
  mockDbSelect.mockReturnValue(chain);
  return {
    get sql() {
      return captured?.sql ?? '';
    },
    get params() {
      return captured?.params ?? [];
    },
  };
}

describe('release-to-revenue store listing helpers', () => {
  it('deduplicates linked merch card ids', () => {
    expect(
      normalizeStoreListing({
        merchCardIds: ['card-a', 'card-a', 'card-b', ''],
      })
    ).toEqual({ merchCardIds: ['card-a', 'card-b'] });
  });

  it('merges explicit and discovered merch card ids without duplicates', () => {
    expect(
      mergeStoreListingMerchCardIds({ merchCardIds: ['card-a'] }, [
        'card-a',
        'card-b',
      ])
    ).toEqual({ merchCardIds: ['card-a', 'card-b'] });
  });
});

describe('findMerchCardIdsForRelease tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the query to the owning creator and never returns another tenant card', async () => {
    const capture = fakeBatchSelect([
      { merchCardId: 'card-A', creatorProfileId: 'profile-A' },
      { merchCardId: 'card-B', creatorProfileId: 'profile-B' },
    ]);

    const cards = await findMerchCardIdsForRelease('release-1', 'profile-A');

    // Behavioral: only the owner's card comes back.
    expect(cards).toEqual(['card-A']);
    expect(cards).not.toContain('card-B');

    // Regression guard: the WHERE clause carries the owner predicate. If a future
    // edit drops it, the rendered SQL/params lose the owner and this fails.
    expect(capture.sql).toContain(
      '"merch_generation_batches"."creator_profile_id"'
    );
    expect(capture.params).toContain('profile-A');
    expect(capture.params).not.toContain('profile-B');
  });

  it('fails closed (no query) when the owner is missing', async () => {
    fakeBatchSelect([]);

    const cards = await findMerchCardIdsForRelease('release-1', '');

    expect(cards).toEqual([]);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});

describe('resolveMerchCardIdsForRun tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseStepOutputs = (
    overrides: Partial<ReleaseToRevenueRunStepOutputs> = {}
  ): ReleaseToRevenueRunStepOutputs => ({
    releaseId: 'release-1',
    triggerSource: 'catalog',
    triggeredAt: '2026-06-19T00:00:00.000Z',
    designPartner: {
      creatorUsername: 'tenant-a',
      creatorProfileId: 'profile-A',
      userId: 'user-A',
      store: { provider: 'printful', scope: 'default' },
      socialAccount: { platform: 'instagram', handle: 'tenant-a' },
      smsListId: 'sms-a',
    },
    release: { title: 'Night Drive', artworkUrl: null, links: [] },
    ...overrides,
  });

  it('returns linked ids without a query when the run already has a store listing', async () => {
    const ids = await resolveMerchCardIdsForRun(
      baseStepOutputs({ storeListing: { merchCardIds: ['card-A'] } })
    );

    expect(ids).toEqual(['card-A']);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('discovers cards scoped to the run owner', async () => {
    const capture = fakeBatchSelect([
      { merchCardId: 'card-A', creatorProfileId: 'profile-A' },
      { merchCardId: 'card-B', creatorProfileId: 'profile-B' },
    ]);

    const ids = await resolveMerchCardIdsForRun(baseStepOutputs());

    expect(ids).toEqual(['card-A']);
    expect(capture.params).toContain('profile-A');
  });

  it('fails closed when the run has no creator owner on the discovery path', async () => {
    fakeBatchSelect([]);

    const ids = await resolveMerchCardIdsForRun(
      baseStepOutputs({
        designPartner:
          undefined as unknown as ReleaseToRevenueRunStepOutputs['designPartner'],
      })
    );

    expect(ids).toEqual([]);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
