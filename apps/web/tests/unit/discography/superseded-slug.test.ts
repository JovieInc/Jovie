import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  withRetry: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() },
}));

import {
  findRedirectByOldSlug,
  findSupersededReleaseSlug,
} from '@/lib/discography/slug';

/** Queue one result per db.select() call, in call order. */
function queries(...results: Array<unknown[] | Error>) {
  for (const result of results) {
    mocks.select.mockImplementationOnce(() => {
      const query = {
        from: () => query,
        where: () => query,
        limit: () => query,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown
        ) =>
          (result instanceof Error
            ? Promise.reject(result)
            : Promise.resolve(result)
          ).then(resolve, reject),
      };
      return query;
    });
  }
}

const row = (slug: string, title = 'Take Me Over') => ({ slug, title });

describe('findSupersededReleaseSlug', () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.error.mockReset();
  });

  it('take-me-over style: no live owner and one published same-title sibling resolves', async () => {
    queries([], [row('take-me-over-2')]);
    expect(await findSupersededReleaseSlug('p1', 'take-me-over')).toEqual({
      currentSlug: 'take-me-over-2',
    });
  });

  it('deleted-holder style: a deleted owner is invisible to the owner query, so the sibling resolves', async () => {
    // The owner query filters deleted_at IS NULL; a deleted holder yields [].
    queries([], [row('take-me-over-2')]);
    expect(
      await findSupersededReleaseSlug('p1', 'take-me-over')
    ).not.toBeNull();
  });

  it('seaside style: a live placeholder owns the base slug, so a different-version sibling is NOT redirected to', async () => {
    queries(
      [{ id: 'placeholder' }],
      [row('seaside-heights-3', 'Seaside Heights')]
    );
    expect(await findSupersededReleaseSlug('p1', 'seaside-heights')).toBeNull();
  });

  it('multiple same-title candidates are ambiguous and never redirect', async () => {
    queries([], [row('take-me-over-2'), row('take-me-over-3')]);
    expect(await findSupersededReleaseSlug('p1', 'take-me-over')).toBeNull();
  });

  it('ignores remixes, other titles, and non-numeric suffixes', async () => {
    queries(
      [],
      [
        row(
          'take-me-over-austin-leeds-remix',
          'Take Me Over - Austin Leeds Remix'
        ),
        row('take-me-over-2', 'Take Me Over (Austin Leeds Remix)'),
        row('take-me-over-live', 'Take Me Over'),
      ]
    );
    expect(await findSupersededReleaseSlug('p1', 'take-me-over')).toBeNull();
  });

  it('rejects unsafe slugs without querying', async () => {
    expect(await findSupersededReleaseSlug('p1', 'bad%slug')).toBeNull();
    expect(await findSupersededReleaseSlug('p1', 'a_b')).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe('findRedirectByOldSlug superseded fallback', () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.error.mockReset();
  });

  it('falls back to the superseded sibling when slug history has no entry', async () => {
    queries([], [], [row('take-me-over-2')]);
    expect(await findRedirectByOldSlug('p1', 'take-me-over')).toEqual({
      type: 'release',
      currentSlug: 'take-me-over-2',
    });
  });

  it('opts out for profile-mode alias callers without extra queries', async () => {
    queries([]);
    expect(
      await findRedirectByOldSlug('p1', 'tip', { includeSuperseded: false })
    ).toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('prefers an explicit slug-history redirect', async () => {
    queries(
      [
        {
          contentType: 'release',
          releaseId: 'r1',
          trackId: null,
          releaseTrackId: null,
        },
      ],
      [{ slug: 'renamed' }]
    );
    expect(await findRedirectByOldSlug('p1', 'old')).toEqual({
      type: 'release',
      currentSlug: 'renamed',
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('fails soft (or throws on request) when the fallback query errors', async () => {
    queries([], new Error('boom'), [], [], new Error('strict'), []);
    expect(await findRedirectByOldSlug('p1', 'x')).toBeNull();
    await expect(
      findRedirectByOldSlug('p1', 'x', { onError: 'throw' })
    ).rejects.toThrow();
  });
});
