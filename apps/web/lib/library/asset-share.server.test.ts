import { beforeEach, describe, expect, it, vi } from 'vitest';

// All DB calls are mocked — no real Postgres connection required.
const selectRows: Array<unknown[]> = [];
const insertResult = { value: [] as unknown[] };
const insertSpy = vi.fn();

// Rows the UPDATE can "match", keyed by assetId. The update mock honors the
// assetId captured from the WHERE clause so a regression that filters by the
// wrong assetId returns zero rows (and the function throws).
const updatableRowsByAssetId = new Map<string, unknown>();
const eqValues: unknown[] = [];

function makeSelectChain() {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    // ensure() awaits `.limit(1)` for the read; pop the next queued result set.
    limit: () => Promise.resolve(selectRows.shift() ?? []),
  };
  return chain;
}

function makeInsertChain() {
  const chain = {
    values: (...args: unknown[]) => {
      insertSpy(...args);
      return chain;
    },
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve(insertResult.value),
  };
  return chain;
}

function makeUpdateChain() {
  const chain = {
    set: () => chain,
    where: () => chain,
    returning: () => {
      // The most-recent `eq(assetId, …)` value is the last string pushed by the
      // captured `eq` (creatorProfileId is also a string, so use whichever maps
      // to a known row).
      const matched = eqValues
        .filter((v): v is string => typeof v === 'string')
        .map(v => updatableRowsByAssetId.get(v))
        .find(Boolean);
      return Promise.resolve(matched ? [matched] : []);
    },
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  },
}));

// Capture the values passed to `eq(column, value)` so the update mock can model
// the WHERE filter, while keeping every other drizzle-orm export real.
vi.mock('drizzle-orm', async importActual => {
  const actual = await importActual<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => {
      eqValues.push(value);
      return actual.eq(column as never, value as never);
    },
  };
});

vi.mock('@/lib/library/asset-share/token', () => ({
  generateLibraryAssetShareToken: () => 'fixed-token-000000000000',
}));

import {
  ensureLibraryAssetShareSettings,
  resolveLibraryAssetShareByToken,
  revokeLibraryAssetShareToken,
  updateLibraryAssetShareVisibility,
} from './asset-share.server';

const baseInput = {
  creatorProfileId: 'creator-1',
  assetId: 'release-abc',
  itemKind: 'release' as const,
  title: 'Performance Budget Release',
  artistHandle: 'tim',
  smartLinkPath: '/tim/performance-budget-release',
};

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    creatorProfileId: 'creator-1',
    assetId: 'release-abc',
    itemKind: 'release',
    visibility: 'private',
    shareSlug: 'performance-budget-release',
    accessToken: 'existing-token',
    tokenRevokedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('ensureLibraryAssetShareSettings idempotency', () => {
  beforeEach(() => {
    selectRows.length = 0;
    insertResult.value = [];
    insertSpy.mockClear();
    updatableRowsByAssetId.clear();
    eqValues.length = 0;
  });

  it('returns the existing row matched by assetId without inserting', async () => {
    selectRows.push([shareRow()]); // findExistingShareRow → byAsset hit

    const result = await ensureLibraryAssetShareSettings(baseInput);

    expect(result.accessToken).toBe('existing-token');
    expect(result.shareSlug).toBe('performance-budget-release');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('returns the slug-matched row when assetId differs but slug collides (the re-open 500 path)', async () => {
    selectRows.push([]); // byAsset miss
    selectRows.push([shareRow({ assetId: 'release-OLD' })]); // bySlug hit

    const result = await ensureLibraryAssetShareSettings(baseInput);

    expect(result.accessToken).toBe('existing-token');
    // The resolved view model carries the STORED row's assetId, not the input —
    // this is the identity the update/revoke paths now filter on.
    expect(result.assetId).toBe('release-OLD');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('inserts when no row exists', async () => {
    selectRows.push([]); // byAsset miss
    selectRows.push([]); // bySlug miss
    insertResult.value = [
      shareRow({ accessToken: 'fixed-token-000000000000' }),
    ];

    const result = await ensureLibraryAssetShareSettings(baseInput);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('fixed-token-000000000000');
  });

  it('re-reads the winning row when the insert hits ON CONFLICT (race)', async () => {
    selectRows.push([]); // initial byAsset miss
    selectRows.push([]); // initial bySlug miss
    insertResult.value = []; // onConflictDoNothing → no row returned
    selectRows.push([shareRow({ accessToken: 'race-winner-token' })]); // re-read byAsset hit

    const result = await ensureLibraryAssetShareSettings(baseInput);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('race-winner-token');
  });

  it('throws if the row is still missing after a conflict (genuine failure)', async () => {
    selectRows.push([]); // initial byAsset miss
    selectRows.push([]); // initial bySlug miss
    insertResult.value = []; // conflict, no row
    selectRows.push([]); // re-read byAsset miss
    selectRows.push([]); // re-read bySlug miss

    await expect(ensureLibraryAssetShareSettings(baseInput)).rejects.toThrow(
      'Failed to ensure library asset share settings'
    );
  });
});

describe('updateLibraryAssetShareVisibility with a slug-collided assetId', () => {
  beforeEach(() => {
    selectRows.length = 0;
    insertResult.value = [];
    insertSpy.mockClear();
    updatableRowsByAssetId.clear();
    eqValues.length = 0;
  });

  it('updates the resolved row (release-OLD), not the requested assetId', async () => {
    // ensure() resolves the existing row by slug (stored assetId differs).
    selectRows.push([]); // byAsset miss
    selectRows.push([shareRow({ assetId: 'release-OLD' })]); // bySlug hit

    // Only the resolved row is updatable; filtering by input.assetId would miss.
    updatableRowsByAssetId.set(
      'release-OLD',
      shareRow({ assetId: 'release-OLD', visibility: 'public' })
    );

    const result = await updateLibraryAssetShareVisibility({
      creatorProfileId: 'creator-1',
      assetId: 'release-abc',
      visibility: 'public',
      artistHandle: 'tim',
      itemKind: 'release',
      title: 'Performance Budget Release',
      smartLinkPath: '/tim/performance-budget-release',
    });

    expect(result.visibility).toBe('public');
    expect(result.assetId).toBe('release-OLD');
  });

  it('revokeLibraryAssetShareToken targets the resolved row, not the requested assetId', async () => {
    selectRows.push([]); // byAsset miss
    selectRows.push([shareRow({ assetId: 'release-OLD' })]); // bySlug hit

    updatableRowsByAssetId.set(
      'release-OLD',
      shareRow({
        assetId: 'release-OLD',
        accessToken: 'fixed-token-000000000000',
      })
    );

    const result = await revokeLibraryAssetShareToken({
      creatorProfileId: 'creator-1',
      assetId: 'release-abc',
      artistHandle: 'tim',
      itemKind: 'release',
      title: 'Performance Budget Release',
      smartLinkPath: '/tim/performance-budget-release',
    });

    expect(result.assetId).toBe('release-OLD');
    expect(result.accessToken).toBe('fixed-token-000000000000');
  });
});

describe('resolveLibraryAssetShareByToken (private share access)', () => {
  beforeEach(() => {
    selectRows.length = 0;
    insertResult.value = [];
    insertSpy.mockClear();
    updatableRowsByAssetId.clear();
    eqValues.length = 0;
  });

  it('resolves the settings and artist handle for a valid, non-revoked token', async () => {
    // The real query filters with `isNull(tokenRevokedAt)` in the WHERE clause —
    // a matching row here models a token that passed that predicate.
    selectRows.push([
      {
        settings: shareRow({ accessToken: 'valid-token' }),
        artistHandle: 'tim',
      },
    ]);

    const result = await resolveLibraryAssetShareByToken('valid-token');

    expect(result).toEqual({
      settings: shareRow({ accessToken: 'valid-token' }),
      artistHandle: 'tim',
    });
  });

  it('returns null (no leaked settings) for a token that does not match any non-revoked row', async () => {
    // Models a revoked or unknown token: the DB predicate excludes the row, so
    // the query returns no rows at all — the caller cannot distinguish "revoked"
    // from "never existed", which is the point (no information leak).
    selectRows.push([]);

    const result = await resolveLibraryAssetShareByToken(
      'revoked-or-unknown-token'
    );

    expect(result).toBeNull();
  });

  it('returns null when the joined artist handle is missing even though a settings row matched', async () => {
    selectRows.push([{ settings: shareRow(), artistHandle: null }]);

    const result = await resolveLibraryAssetShareByToken('valid-token');

    expect(result).toBeNull();
  });
});
