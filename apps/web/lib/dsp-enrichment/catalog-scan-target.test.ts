import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { getBoundSpotifyArtistId } from './catalog-scan-target';

const profileId = '00000000-0000-4000-8000-000000000001';
const canonical = 'a'.repeat(22);
const other = 'b'.repeat(22);

function database(
  profile: { spotifyId: string | null; spotifyUrl?: string | null } | undefined,
  match?: { externalArtistId: string | null; status: string }
) {
  const predicates: unknown[] = [];
  const rows = [profile ? [profile] : [], match ? [match] : []];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((predicate: unknown) => {
        predicates.push(predicate);
        return { limit: vi.fn().mockResolvedValue(rows.shift()) };
      }),
    })),
  }));
  return { tx: { select } as unknown as DbOrTransaction, select, predicates };
}

describe('Spotify catalog scan binding', () => {
  it.each([
    [canonical, undefined, canonical],
    [null, { status: 'confirmed', externalArtistId: canonical }, canonical],
    [
      canonical,
      { status: 'confirmed', externalArtistId: canonical },
      canonical,
    ],
    [null, { status: 'suggested', externalArtistId: canonical }, null],
    [null, { status: 'auto_confirmed', externalArtistId: canonical }, null],
    [canonical, { status: 'confirmed', externalArtistId: other }, null],
    [canonical, { status: 'rejected', externalArtistId: canonical }, null],
    [canonical, { status: 'confirmed', externalArtistId: null }, null],
    ['invalid-id', undefined, null],
    [null, { status: 'confirmed', externalArtistId: 'invalid-id' }, null],
    [canonical, { status: 'suggested', externalArtistId: other }, canonical],
  ] as const)(
    'honors canonical identity and explicit decisions %j %j',
    async (spotifyId, match, expected) => {
      const db = database({ spotifyId }, match);
      expect(await getBoundSpotifyArtistId(db.tx, profileId)).toBe(expected);
      const dialect = new PgDialect();
      const queries = db.predicates.map(predicate =>
        dialect.sqlToQuery(predicate as never)
      );
      expect(queries[0].params).toEqual([profileId]);
      expect(queries[0].sql).toContain('creator_profiles');
      expect(queries[1].params).toEqual([profileId, 'spotify']);
      expect(queries[1].sql).toContain('creator_profile_id');
      expect(queries[1].sql).toContain('provider_id');
    }
  );

  it('does not grant another row authority when the profile does not exist', async () => {
    const db = database(undefined, {
      status: 'confirmed',
      externalArtistId: canonical,
    });
    expect(await getBoundSpotifyArtistId(db.tx, profileId)).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  describe('legacy profiles that only store spotify_url', () => {
    const url = (id: string) => `https://open.spotify.com/artist/${id}`;

    it.each([
      [null, url(canonical), undefined, canonical],
      [null, `${url(canonical)}?si=abc`, undefined, canonical],
      [
        null,
        url(canonical),
        { status: 'confirmed', externalArtistId: canonical },
        canonical,
      ],
      [
        null,
        url(canonical),
        { status: 'confirmed', externalArtistId: other },
        null,
      ],
      [
        null,
        url(canonical),
        { status: 'rejected', externalArtistId: canonical },
        null,
      ],
      [
        null,
        url(canonical),
        { status: 'suggested', externalArtistId: other },
        canonical,
      ],
      [canonical, url(canonical), undefined, canonical],
      [canonical, url(other), undefined, null],
      [null, 'https://example.com/artist/' + canonical, undefined, null],
      [null, 'https://open.spotify.com/album/' + canonical, undefined, null],
    ] as const)(
      'binds %j + %j with %j to %j',
      async (spotifyId, spotifyUrl, match, expected) => {
        const db = database({ spotifyId, spotifyUrl }, match);
        expect(await getBoundSpotifyArtistId(db.tx, profileId)).toBe(expected);
      }
    );
  });
});
