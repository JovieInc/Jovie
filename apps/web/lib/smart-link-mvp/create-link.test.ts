import { describe, expect, it, vi } from 'vitest';
import { assertNeutralToolResult, FREE_LINKS_PER_MONTH } from './contract';
import { createSmartLink } from './create-link';
import type {
  CanonicalRelease,
  LinkActor,
  ResolvedRelease,
  SmartLinkResolver,
  SmartLinkStore,
  StoredLink,
} from './types';

const ORIGIN = 'https://jov.ie';
const TRACK = 'https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r';

function release(overrides: Partial<ResolvedRelease> = {}): ResolvedRelease {
  return {
    title: 'Creep',
    artist: 'Radiohead',
    artworkUrl: null,
    isrc: 'GBAYE9200070',
    upc: null,
    providerKey: 'spotify:70LcF31zb1H0PyJoS1Sx1r',
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: TRACK,
      },
    ],
    ...overrides,
  };
}

function memory() {
  const rows: StoredLink[] = [];
  const anonymous = new Map<string, number>();
  let canonical: CanonicalRelease | null = null;
  const store: SmartLinkStore = {
    async findByIsrc(isrc) {
      return rows.find(row => row.isrc === isrc) ?? null;
    },
    async findByProviderKey(providerKey) {
      return rows.find(row => row.providerKey === providerKey) ?? null;
    },
    async findCanonical() {
      return canonical;
    },
    async countAnonymousSince(subjectHash) {
      return anonymous.get(subjectHash) ?? 0;
    },
    async insert(row) {
      if (
        rows.some(
          existing =>
            existing.code === row.code ||
            (row.isrc !== null && existing.isrc === row.isrc) ||
            (row.providerKey !== null &&
              existing.providerKey === row.providerKey)
        )
      ) {
        return 'conflict';
      }
      const stored: StoredLink = {
        code: row.code,
        query: row.query,
        kind: row.kind,
        title: row.title,
        artistName: row.artistName,
        artworkUrl: row.artworkUrl,
        providers: row.providers,
        isrc: row.isrc,
        upc: row.upc,
        providerKey: row.providerKey,
        createdByUserId: row.createdByUserId,
      };
      rows.push(stored);
      if (row.anonymousSubjectHash) {
        anonymous.set(
          row.anonymousSubjectHash,
          (anonymous.get(row.anonymousSubjectHash) ?? 0) + 1
        );
      }
      return stored;
    },
  };
  return {
    store,
    rows,
    setCanonical(value: CanonicalRelease | null) {
      canonical = value;
    },
  };
}

function resolver(calls: { n: number }): SmartLinkResolver {
  return {
    async resolveTrackUrl() {
      calls.n += 1;
      return { ok: true, value: release() };
    },
    async resolveIsrc() {
      calls.n += 1;
      return { ok: true, value: release() };
    },
    async searchTracks() {
      calls.n += 1;
      return { ok: true, value: [] };
    },
    async resolveArtist() {
      calls.n += 1;
      return {
        ok: true,
        value: {
          status: 'choices',
          candidates: [
            {
              id: 'artist:spotify:4Z8W4fKeB5YxbusRsdQVPb',
              name: 'Radiohead',
              artist: null,
              url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
              artworkUrl: null,
            },
          ],
        },
      };
    },
  };
}

const anonymous: LinkActor = {
  userId: null,
  anonymousSubjectHash: 'abc123',
};

describe('createSmartLink', () => {
  it('returns the stored link on a repeat and does not resolve again', async () => {
    const db = memory();
    const calls = { n: 0 };
    const first = await createSmartLink({
      query: TRACK,
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: resolver(calls),
      allocateCode: () => 'abcd2345',
    });
    const second = await createSmartLink({
      query: TRACK,
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: resolver(calls),
      allocateCode: () => 'shouldnot',
    });
    expect(first).toMatchObject({
      status: 'created',
      code: 'abcd2345',
      shortUrl: 'https://jov.ie/l/abcd2345',
      claimed: false,
      claimUrl: 'https://jov.ie/l/abcd2345/claim',
    });
    expect(second.status).toBe('existing');
    expect(second.shortUrl).toBe(first.shortUrl);
    expect(calls.n).toBe(1);
    expect(db.rows).toHaveLength(1);
  });

  it('caps anonymous creations and stays neutral about price', async () => {
    const db = memory();
    const calls = { n: 0 };
    let n = 0;
    for (let i = 0; i < FREE_LINKS_PER_MONTH; i++) {
      const created = await createSmartLink({
        query: `Artist ${i} - Track ${i}`,
        origin: ORIGIN,
        actor: anonymous,
        store: db.store,
        resolver: {
          ...resolver(calls),
          async searchTracks() {
            return {
              ok: true,
              value: [
                {
                  id: `id-${i}`,
                  name: `Track ${i}`,
                  artist: `Artist ${i}`,
                  url: `https://open.spotify.com/track/${String(i).padStart(22, 'a')}`,
                  artworkUrl: null,
                },
              ],
            };
          },
          async resolveTrackUrl(url) {
            n += 1;
            return {
              ok: true,
              value: release({
                isrc: `USRC1${String(7600000 + i)}`,
                providerKey: `spotify:${url.split('/').pop()}`,
                providers: [{ key: 'spotify', label: 'Spotify', url }],
              }),
            };
          },
        },
        allocateCode: () => `code${i}234`,
      });
      expect(created.status).toBe('created');
    }
    const limited = await createSmartLink({
      query: 'Someone - Else',
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: {
        ...resolver(calls),
        async searchTracks() {
          return {
            ok: true,
            value: [
              {
                id: 'over-cap',
                name: 'Else',
                artist: 'Someone',
                url: 'https://open.spotify.com/track/bbbbbbbbbbbbbbbbbbbbbb',
                artworkUrl: null,
              },
            ],
          };
        },
        async resolveTrackUrl(url) {
          return {
            ok: true,
            value: release({
              isrc: 'USRC17609999',
              providerKey: 'spotify:bbbbbbbbbbbbbbbbbbbbbb',
              providers: [{ key: 'spotify', label: 'Spotify', url }],
            }),
          };
        },
      },
    });
    expect(limited).toEqual({
      status: 'error',
      code: 'LIMIT_REACHED',
      plansUrl: 'https://jov.ie/smart-links#pricing',
    });
    expect(() => assertNeutralToolResult(limited)).not.toThrow();
    expect(JSON.stringify(limited)).not.toMatch(/\$|upgrade|checkout/i);
    expect(n).toBe(FREE_LINKS_PER_MONTH);
  });

  it('asks before saving a different version of the song', async () => {
    const db = memory();
    const result = await createSmartLink({
      query: 'Radiohead - Creep',
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: {
        ...resolver({ n: 0 }),
        async searchTracks() {
          return {
            ok: true,
            value: [
              {
                id: 'acoustic',
                name: 'Creep (Acoustic)',
                artist: 'Radiohead',
                url: TRACK,
                artworkUrl: null,
              },
            ],
          };
        },
      },
    });
    expect(result.status).toBe('needs_choice');
    expect(db.rows).toHaveLength(0);
  });

  it('asks for a choice on an artist name and does not insert', async () => {
    const db = memory();
    const calls = { n: 0 };
    const result = await createSmartLink({
      query: 'Radiohead',
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: resolver(calls),
    });
    expect(result.status).toBe('needs_choice');
    expect(result.candidates).toHaveLength(1);
    expect(db.rows).toHaveLength(0);
    expect(calls.n).toBe(1);
  });

  it('returns a claimed catalog page without creating a duplicate', async () => {
    const db = memory();
    const resolve = vi.fn();
    db.setCanonical({
      pageUrl: 'https://jov.ie/radiohead/creep',
      title: 'Creep',
      artist: 'Radiohead',
      artworkUrl: null,
    });
    const result = await createSmartLink({
      query: 'GBAYE9200070',
      origin: ORIGIN,
      actor: anonymous,
      store: db.store,
      resolver: {
        ...resolver({ n: 0 }),
        resolveIsrc: resolve,
      },
    });
    expect(result).toMatchObject({
      status: 'existing',
      shortUrl: 'https://jov.ie/radiohead/creep',
      claimed: true,
      claimUrl: null,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it('records a signed-in creator without treating the link as claimed', async () => {
    const db = memory();
    const result = await createSmartLink({
      query: TRACK,
      origin: ORIGIN,
      actor: {
        userId: '11111111-1111-4111-8111-111111111111',
        anonymousSubjectHash: null,
      },
      store: db.store,
      resolver: resolver({ n: 0 }),
      allocateCode: () => 'signed234',
    });
    expect(result.claimed).toBe(false);
    expect(result.claimUrl).toBe('https://jov.ie/l/signed234/claim');
    expect(db.rows[0]?.createdByUserId).toBe(
      '11111111-1111-4111-8111-111111111111'
    );
  });
});
