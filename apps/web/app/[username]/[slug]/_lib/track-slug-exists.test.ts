import { beforeEach, describe, expect, it, vi } from 'vitest';

const { results, fromTables } = vi.hoisted(() => ({
  results: [] as unknown[][],
  fromTables: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/query-timeout', () => ({ QUERY_TIMEOUTS: { api: 1 } }));
vi.mock('@/lib/db', () => ({
  withRetry: (read: () => Promise<unknown>) => read(),
  db: {
    select: () => {
      const builder = {
        from: (table: unknown) => {
          fromTables.push(table);
          return builder;
        },
        where: () => builder,
        limit: async () => results.shift() ?? [],
      };
      return builder;
    },
  },
}));

import { discogReleaseTracks, discogTracks } from '@/lib/db/schema/content';
import { trackSlugExistsInRelease } from './track-slug-exists';

describe('trackSlugExistsInRelease', () => {
  beforeEach(() => {
    results.length = 0;
    fromTables.length = 0;
  });

  it('finds a release-track row without checking the legacy table', async () => {
    results.push([{ id: 'rt-1' }]);
    await expect(trackSlugExistsInRelease('rel-1', 'song-2')).resolves.toBe(
      true
    );
    expect(fromTables).toEqual([discogReleaseTracks]);
  });

  it('falls back to legacy discog_tracks', async () => {
    results.push([], [{ id: 't-1' }]);
    await expect(trackSlugExistsInRelease('rel-1', 'song-2')).resolves.toBe(
      true
    );
    expect(fromTables).toEqual([discogReleaseTracks, discogTracks]);
  });

  it('returns false when neither table has the slug', async () => {
    results.push([], []);
    await expect(trackSlugExistsInRelease('rel-1', 'song-2')).resolves.toBe(
      false
    );
  });
});
