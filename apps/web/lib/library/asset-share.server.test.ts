/**
 * asset-share.server.test.ts
 *
 * Regression coverage for ensureLibraryAssetShareSettings idempotency
 * (GitHub #12407): re-opening a release with existing share settings, and a
 * concurrent first-open race, must both return the existing row instead of
 * 500ing on the (creator_profile_id, asset_id) unique constraint.
 *
 * All DB calls are mocked — no real Postgres connection required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — db.select() pulls from selectResults, db.insert() from insertResults
// ---------------------------------------------------------------------------

const selectResults: unknown[][] = [];
const insertResults: unknown[][] = [];
const insertSpy = vi.fn();
const onConflictSpy = vi.fn();

function makeSelectChain(): Record<string, (...a: unknown[]) => unknown> {
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ['from', 'where']) chain[m] = () => chain;
  chain['limit'] = () => Promise.resolve(selectResults.shift() ?? []);
  return chain;
}

function makeInsertChain(): Record<string, (...a: unknown[]) => unknown> {
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  chain['values'] = () => chain;
  chain['onConflictDoNothing'] = (...a: unknown[]) => {
    onConflictSpy(...a);
    return chain;
  };
  chain['returning'] = () => Promise.resolve(insertResults.shift() ?? []);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectChain(),
    insert: (...args: unknown[]) => {
      insertSpy(...args);
      return makeInsertChain();
    },
  },
}));

import { ensureLibraryAssetShareSettings } from './asset-share.server';

const INPUT = {
  creatorProfileId: 'creator-1',
  assetId: 'release-1',
  itemKind: 'release' as const,
  title: 'Performance Budget Release',
  artistHandle: 'tim',
  smartLinkPath: '/tim/performance-budget-release',
};

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    creatorProfileId: INPUT.creatorProfileId,
    assetId: INPUT.assetId,
    itemKind: 'release',
    visibility: 'private',
    shareSlug: 'performance-budget-release',
    accessToken: 'token-existing',
    tokenRevokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  selectResults.length = 0;
  insertResults.length = 0;
  insertSpy.mockClear();
  onConflictSpy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ensureLibraryAssetShareSettings idempotency', () => {
  it('returns the existing row on re-open without inserting', async () => {
    selectResults.push([shareRow()]); // first select finds it

    const view = await ensureLibraryAssetShareSettings(INPUT);

    expect(view.assetId).toBe('release-1');
    expect(view.shareUrl).toContain('token-existing');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('returns the winner on a concurrent first-open race instead of throwing', async () => {
    selectResults.push([]); // first select: not found yet
    insertResults.push([]); // insert suppressed by onConflictDoNothing
    selectResults.push([shareRow({ accessToken: 'token-race-winner' })]); // re-read

    const view = await ensureLibraryAssetShareSettings(INPUT);

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(view.shareUrl).toContain('token-race-winner');
  });

  it('creates a new row on genuine first open', async () => {
    selectResults.push([]); // not found
    insertResults.push([shareRow({ accessToken: 'token-fresh' })]); // insert wins

    const view = await ensureLibraryAssetShareSettings(INPUT);

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(view.shareUrl).toContain('token-fresh');
  });

  it('guards the insert with the (creator_profile_id, asset_id) conflict target', async () => {
    selectResults.push([]); // not found
    insertResults.push([shareRow()]); // insert wins

    await ensureLibraryAssetShareSettings(INPUT);

    expect(onConflictSpy).toHaveBeenCalledOnce();
    const [{ target }] = onConflictSpy.mock.calls[0] as [
      { target: { name: string }[] },
    ];
    expect(target.map(col => col.name)).toEqual([
      'creator_profile_id',
      'asset_id',
    ]);
  });

  it('throws when the row cannot be created or re-read', async () => {
    selectResults.push([]); // not found
    insertResults.push([]); // insert suppressed
    selectResults.push([]); // re-read still empty (true failure)

    await expect(ensureLibraryAssetShareSettings(INPUT)).rejects.toThrow(
      'Failed to create library asset share settings'
    );
  });
});
