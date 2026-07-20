import { getTableName } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/app';
import { LIBRARY_SHARE_DROP_ROUTE_PREFIX } from '@/lib/library-share/constants';
import { verifyLibrarySharePassphrase } from '@/lib/library-share/passphrase';

// All DB calls are mocked — no real Postgres connection required. Table
// routing uses `getTableName` (matches the pattern in
// lib/release-to-revenue/gmv-attribution.test.ts) rather than object
// identity, so the mock stays robust to module re-instantiation.
const ownedReleaseRows: Array<Array<{ id: string }>> = [];
const selectSpy = vi.fn();
const dropValuesSpy = vi.fn();
const itemsValuesSpy = vi.fn();
const dropIdToReturn = { value: 'drop-id-1' };

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      selectSpy(...args);
      return {
        from: () => ({
          where: () => Promise.resolve(ownedReleaseRows.shift() ?? []),
        }),
      };
    },
    insert: (table: unknown) => {
      const tableName = getTableName(table as never);
      if (tableName === 'library_share_drops') {
        return {
          values: (values: unknown) => {
            dropValuesSpy(values);
            const captured = values as Record<string, unknown>;
            return {
              returning: () =>
                Promise.resolve([
                  { id: dropIdToReturn.value, token: captured.token },
                ]),
            };
          },
        };
      }
      return {
        values: (values: unknown) => {
          itemsValuesSpy(values);
          return Promise.resolve(undefined);
        },
      };
    },
  },
}));

import { createLibraryShareDrop } from '@/lib/library-share/service';

const PROFILE_ID = 'creator-profile-1';

function lastDropInsert(): Record<string, unknown> {
  const call = dropValuesSpy.mock.calls.at(-1);
  if (!call)
    throw new Error('db.insert(libraryShareDrops).values() was not called');
  return call[0] as Record<string, unknown>;
}

function lastItemsInsert(): Array<Record<string, unknown>> {
  const call = itemsValuesSpy.mock.calls.at(-1);
  if (!call)
    throw new Error('db.insert(libraryShareDropItems).values() was not called');
  return call[0] as Array<Record<string, unknown>>;
}

describe('createLibraryShareDrop', () => {
  beforeEach(() => {
    ownedReleaseRows.length = 0;
    selectSpy.mockClear();
    dropValuesSpy.mockClear();
    itemsValuesSpy.mockClear();
    dropIdToReturn.value = 'drop-id-1';
  });

  it('throws before touching the database when releaseIds is empty', async () => {
    await expect(
      createLibraryShareDrop(PROFILE_ID, {
        title: 'Empty Drop',
        releaseIds: [],
      })
    ).rejects.toThrow('At least one release is required');

    expect(selectSpy).not.toHaveBeenCalled();
    expect(dropValuesSpy).not.toHaveBeenCalled();
    expect(itemsValuesSpy).not.toHaveBeenCalled();
  });

  it('throws and never inserts when a requested release is not owned/available (soft-deleted or other creator)', async () => {
    // Two unique release ids requested, but the ownership query only returns one —
    // covers the deletedAt/creatorProfileId filter collapsing to a mismatch.
    ownedReleaseRows.push([{ id: 'release-1' }]);

    await expect(
      createLibraryShareDrop(PROFILE_ID, {
        title: 'Partial Ownership Drop',
        releaseIds: ['release-1', 'release-2'],
      })
    ).rejects.toThrow('One or more releases are not available for sharing');

    expect(dropValuesSpy).not.toHaveBeenCalled();
    expect(itemsValuesSpy).not.toHaveBeenCalled();
  });

  it('dedups duplicate releaseIds before the ownership check and before inserting items', async () => {
    // Same release id repeated 3x must collapse to a single unique id — the
    // ownership query is mocked to return exactly 1 row, so a regression that
    // removes the `[...new Set(...)]` dedup would compare length 3 vs 1 and
    // incorrectly throw "not available for sharing".
    ownedReleaseRows.push([{ id: 'release-1' }]);

    const result = await createLibraryShareDrop(PROFILE_ID, {
      title: 'Duplicate Ids Drop',
      releaseIds: ['release-1', 'release-1', 'release-1'],
    });

    expect(result.id).toBe('drop-id-1');
    const items = lastItemsInsert();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      dropId: 'drop-id-1',
      releaseId: 'release-1',
      position: 0,
    });
  });

  it('creates a drop with a hashed (non-plaintext) passphrase, resolved expiry, trimmed copy, and deduped/ordered items', async () => {
    ownedReleaseRows.push([{ id: 'release-1' }, { id: 'release-2' }]);
    dropIdToReturn.value = 'drop-id-42';
    const expiresAtIso = '2026-08-01T00:00:00.000Z';

    const result = await createLibraryShareDrop(PROFILE_ID, {
      title: '  My Curated Drop  ',
      message: '  Check this out  ',
      passphrase: 'sesame123',
      expiresAt: expiresAtIso,
      // Duplicate 'release-1' must collapse; order of first occurrence is preserved.
      releaseIds: ['release-1', 'release-2', 'release-1'],
    });

    const inserted = lastDropInsert();

    expect(inserted.creatorProfileId).toBe(PROFILE_ID);
    expect(inserted.title).toBe('My Curated Drop');
    expect(inserted.message).toBe('Check this out');
    expect(inserted.layout).toBe('grid'); // default when input.layout is omitted
    expect(inserted.downloadsEnabled).toBe(true); // default when omitted

    // Passphrase must be hashed, not stored raw, and must round-trip through
    // the real verify function (validates the actual service<->passphrase wiring).
    const passphraseHash = inserted.passphraseHash as string;
    expect(passphraseHash).not.toBe('sesame123');
    expect(passphraseHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(verifyLibrarySharePassphrase('sesame123', passphraseHash)).toBe(
      true
    );
    expect(verifyLibrarySharePassphrase('wrong-pass', passphraseHash)).toBe(
      false
    );

    // expiresAt is resolved to a Date matching the input ISO string.
    const expiresAt = inserted.expiresAt as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.toISOString()).toBe(expiresAtIso);

    // token is generated fresh and the share URL is derived from it.
    const token = inserted.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);

    expect(result).toEqual({
      id: 'drop-id-42',
      token,
      shareUrl: `${BASE_URL}${LIBRARY_SHARE_DROP_ROUTE_PREFIX}/${token}`,
    });

    // Items are deduped (2 unique ids, not 3) and positioned by first occurrence.
    const items = lastItemsInsert();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      dropId: 'drop-id-42',
      releaseId: 'release-1',
      position: 0,
    });
    expect(items[1]).toMatchObject({
      dropId: 'drop-id-42',
      releaseId: 'release-2',
      position: 1,
    });
  });

  it('respects an explicit downloadsEnabled: false instead of coercing to the true default', async () => {
    // Mutation guard: `input.downloadsEnabled ?? true` must not become
    // `input.downloadsEnabled || true`, which would silently force `true`
    // whenever the artist explicitly disables downloads.
    ownedReleaseRows.push([{ id: 'release-1' }]);

    await createLibraryShareDrop(PROFILE_ID, {
      title: 'No Downloads Drop',
      downloadsEnabled: false,
      layout: 'reel',
      releaseIds: ['release-1'],
    });

    const inserted = lastDropInsert();
    expect(inserted.downloadsEnabled).toBe(false);
    expect(inserted.layout).toBe('reel');
  });

  it('stores a null passphraseHash when no passphrase is given, and when the passphrase is whitespace-only', async () => {
    ownedReleaseRows.push([{ id: 'release-1' }]);
    await createLibraryShareDrop(PROFILE_ID, {
      title: 'No Passphrase Drop',
      releaseIds: ['release-1'],
    });
    expect(lastDropInsert().passphraseHash).toBeNull();

    ownedReleaseRows.push([{ id: 'release-1' }]);
    await createLibraryShareDrop(PROFILE_ID, {
      title: 'Whitespace Passphrase Drop',
      passphrase: '   ',
      releaseIds: ['release-1'],
    });
    // Trimmed to empty string, which must NOT be hashed (hashing '' would
    // still gate the drop behind a passphrase check for an empty input).
    expect(lastDropInsert().passphraseHash).toBeNull();
  });

  it('stores a null expiresAt and null message when both are omitted', async () => {
    ownedReleaseRows.push([{ id: 'release-1' }]);

    await createLibraryShareDrop(PROFILE_ID, {
      title: 'No Expiry Drop',
      releaseIds: ['release-1'],
    });

    const inserted = lastDropInsert();
    expect(inserted.expiresAt).toBeNull();
    expect(inserted.message).toBeNull();
  });
});
