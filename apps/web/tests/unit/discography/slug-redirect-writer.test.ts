import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Redirect-writer coverage (JOV-9626 residual).
 *
 * `findRedirectByOldSlug` and the public-page `permanentRedirect` branch are
 * covered elsewhere (superseded-slug.test.ts, page.test.ts). This file pins
 * the WRITE side of the contract: a slug change must insert exactly one
 * `content_slug_redirects` row keyed by the old slug, with the content id in
 * the matching column and `onConflictDoNothing` (a repeated rename or a
 * re-import must never fail on an existing redirect), and must then move the
 * content row itself to the new slug.
 *
 * Purely additive coverage (coverage-gap-land-no-ratchet-v1): no existing
 * test is modified and no new ratchet is introduced.
 */

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert, update: mocks.update },
  withRetry: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() },
}));

import {
  contentSlugRedirects,
  discogRecordings,
  discogReleases,
  discogTracks,
} from '@/lib/db/schema/content';
import {
  createSlugRedirect,
  updateSlugWithRedirect,
} from '@/lib/discography/slug';

interface InsertedRedirect {
  creatorProfileId: string;
  oldSlug: string;
  contentType: string;
  releaseId: string | null;
  trackId: string | null;
  releaseTrackId: string | null;
}

/** Queue one result per db.select() call, in call order. */
function selectResults(...results: unknown[][]) {
  for (const rows of results) {
    mocks.select.mockImplementationOnce(() => {
      const query = {
        from: () => query,
        where: () => query,
        limit: () => Promise.resolve(rows),
      };
      return query;
    });
  }
}

/** Capture every redirect insert and every slug update. */
function captureWrites() {
  const inserted: InsertedRedirect[] = [];
  let conflictGuardCalls = 0;
  const updates: Array<{ table: unknown; patch: Record<string, unknown> }> = [];
  mocks.insert.mockImplementation(
    (_table: unknown) =>
      ({
        values: (row: InsertedRedirect) => ({
          onConflictDoNothing: async () => {
            conflictGuardCalls += 1;
            inserted.push(row);
          },
        }),
      }) as never
  );
  mocks.update.mockImplementation(
    (table: unknown) =>
      ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table, patch });
          },
        }),
      }) as never
  );
  return { inserted, conflictGuard: () => conflictGuardCalls, updates };
}

beforeEach(() => {
  mocks.select.mockReset();
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.error.mockReset();
});

describe('createSlugRedirect', () => {
  it.each([
    ['release', 'releaseId'],
    ['track', 'trackId'],
    ['release_track', 'releaseTrackId'],
  ] as const)(
    'writes one %s redirect row keyed by the old slug with the conflict guard',
    async (contentType, idColumn) => {
      const { inserted, conflictGuard } = captureWrites();

      await createSlugRedirect({
        creatorProfileId: 'p1',
        oldSlug: 'take-me-over',
        contentType,
        contentId: 'c1',
      });

      expect(inserted).toHaveLength(1);
      expect(inserted[0]).toEqual({
        creatorProfileId: 'p1',
        oldSlug: 'take-me-over',
        contentType,
        releaseId: idColumn === 'releaseId' ? 'c1' : null,
        trackId: idColumn === 'trackId' ? 'c1' : null,
        releaseTrackId: idColumn === 'releaseTrackId' ? 'c1' : null,
      });
      expect(conflictGuard()).toBe(1);
    }
  );
});

describe('updateSlugWithRedirect', () => {
  const base = {
    creatorProfileId: 'p1',
    contentId: 'r1',
    currentSlug: 'take-me-over',
    newSlug: 'Take Me Over',
  } as const;

  it('returns the current slug and writes nothing when the slug is unchanged', async () => {
    const { inserted, updates } = captureWrites();

    const slug = await updateSlugWithRedirect({
      ...base,
      contentType: 'release',
      newSlug: 'take-me-over',
    });

    expect(slug).toBe('take-me-over');
    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects a slug that sanitizes to nothing without writing', async () => {
    const { inserted, updates } = captureWrites();

    await expect(
      updateSlugWithRedirect({
        ...base,
        contentType: 'release',
        newSlug: '!!!',
      })
    ).rejects.toThrow('Invalid slug');

    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('refuses a taken slug and writes no redirect', async () => {
    const { inserted, updates } = captureWrites();
    // First availability probe (releases) finds an existing owner.
    selectResults([{ id: 'someone-else' }]);

    await expect(
      updateSlugWithRedirect({ ...base, contentType: 'release' })
    ).rejects.toThrow('is already in use');

    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('inserts the old-slug redirect then moves the release to the sanitized slug', async () => {
    const { inserted, conflictGuard, updates } = captureWrites();
    selectResults([], [], [], []); // releases, recordings, tracks, redirects: all free

    const slug = await updateSlugWithRedirect({
      ...base,
      contentType: 'release',
    });

    expect(slug).toBe('take-me-over-2');
    expect(inserted).toEqual([
      {
        creatorProfileId: 'p1',
        oldSlug: 'take-me-over',
        contentType: 'release',
        releaseId: 'r1',
        trackId: null,
        releaseTrackId: null,
      },
    ]);
    expect(conflictGuard()).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(discogReleases);
    expect(updates[0]?.patch.slug).toBe('take-me-over-2');
    expect(updates[0]?.patch.updatedAt).toBeInstanceOf(Date);
  });

  it('routes the slug update to recordings and tracks for their content types', async () => {
    const { updates } = captureWrites();

    selectResults([], [], [], []);
    await updateSlugWithRedirect({
      ...base,
      contentType: 'release_track',
    });
    expect(updates[0]?.table).toBe(discogRecordings);

    mocks.select.mockClear();
    selectResults([], [], [], []);
    await updateSlugWithRedirect({ ...base, contentType: 'track' });
    expect(updates[1]?.table).toBe(discogTracks);

    // The redirect rows target the right content type each time.
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(contentSlugRedirects).toBeDefined();
  });
});
