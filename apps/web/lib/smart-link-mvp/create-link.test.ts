import { describe, expect, it, vi } from 'vitest';
import {
  assertNeutralToolResult,
  FREE_LINKS_PER_MONTH,
  MAKE_LINK_ANNOTATIONS,
} from './contract';
import { createSmartLink } from './create-link';
import type {
  CanonicalRelease,
  CreateLinkInput,
  LinkActor,
  NewStoredLink,
  ResolvedRelease,
  SmartLinkResolver,
  SmartLinkStore,
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
  const rows: NewStoredLink[] = [];
  let canonical: CanonicalRelease | null = null;
  const used = (hash: string, month: Date) =>
    rows.filter(
      row =>
        row.anonymousSubjectHash === hash &&
        row.anonymousMonth?.getTime() === month.getTime()
    ).length;
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
    async countAnonymousInMonth(subjectHash, month) {
      return used(subjectHash, month);
    },
    async insertWithQuota(row) {
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
      if (row.anonymousSubjectHash) {
        if (!row.anonymousMonth) throw new Error('Missing quota month');
        if (
          used(row.anonymousSubjectHash, row.anonymousMonth) >=
          FREE_LINKS_PER_MONTH
        )
          return 'conflict';
      }
      rows.push(row);
      return row;
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

function createRecording(
  number: number,
  db: ReturnType<typeof memory>,
  overrides: Partial<CreateLinkInput> = {}
) {
  const isrc = `USRC1${String(number).padStart(7, '0')}`;
  const id = String(number).padStart(22, 'a');
  return createSmartLink({
    query: isrc,
    origin: ORIGIN,
    actor: anonymous,
    store: db.store,
    now: new Date('2026-10-03T00:00:00Z'),
    allocateCode: () => String(number).padStart(8, 'a'),
    resolver: {
      ...resolver({ n: 0 }),
      async resolveIsrc() {
        return {
          ok: true,
          value: release({
            isrc,
            providerKey: `spotify:${id}`,
            providers: [
              {
                key: 'spotify',
                label: 'Spotify',
                url: `https://open.spotify.com/track/${id}`,
              },
            ],
          }),
        };
      },
    },
    ...overrides,
  });
}

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
    expect(() =>
      assertNeutralToolResult({
        status: 'created',
        title: 'Motion Sickness',
        artist: '$uicideboy$',
        shortUrl: 'https://jov.ie/l/abc',
        providers: [
          {
            key: 'apple_music',
            label: 'Apple Music',
            url: 'https://music.apple.com/us/album/motion-sickness/1?i=2',
          },
        ],
      })
    ).not.toThrow();
    expect(() =>
      assertNeutralToolResult({
        status: 'error',
        code: 'LIMIT_REACHED',
        plansUrl: 'https://jov.ie/smart-links#pricing',
        title: 'Upgrade for $10/mo',
      })
    ).toThrow(/commercial copy/);
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
    expect(db.rows[0]?.anonymousSubjectHash).toBeNull();
    expect(db.rows[0]?.anonymousMonth).toBeNull();
  });

  it.each([
    ['soundcloud', 'https://soundcloud.com/artist/song'],
    ['bandcamp', 'https://artist.bandcamp.com/track/song'],
  ] as const)(
    'does not promise idempotency for unkeyed %s recordings',
    async (key, url) => {
      const db = memory();
      const resolveTrackUrl = vi
        .fn<SmartLinkResolver['resolveTrackUrl']>()
        .mockResolvedValue({
          ok: true,
          value: release({
            isrc: null,
            providerKey: null,
            providers: [{ key, label: key, url }],
          }),
        });
      let code = 0;
      const input: CreateLinkInput = {
        query: url,
        origin: ORIGIN,
        actor: anonymous,
        store: db.store,
        resolver: { ...resolver({ n: 0 }), resolveTrackUrl },
        allocateCode: () => `unkeyed${++code}`,
      };
      const first = await createSmartLink(input);
      const second = await createSmartLink(input);
      expect([first.status, second.status]).toEqual(['created', 'created']);
      expect(first.code).not.toBe(second.code);
      expect(db.rows).toHaveLength(2);
      expect(
        db.rows.every(row => row.isrc === null && row.providerKey === null)
      ).toBe(true);
      expect(resolveTrackUrl).toHaveBeenCalledTimes(2);
      expect(MAKE_LINK_ANNOTATIONS.idempotentHint).toBe(false);
    }
  );

  it.each([
    ['夜に駆ける (Live)', '群青 (Live)', false],
    ['が (Live)', 'か (Live)', false],
    ['夜に駆ける (Live)', '夜に駆ける (Live)', true],
    ['が (Live)', 'か\u3099 (Live)', true],
  ] as const)(
    'matches Unicode recording %s against %s without dropping letters or voicing',
    async (title, candidateTitle, exact) => {
      const db = memory();
      const resolveTrackUrl = vi
        .fn<SmartLinkResolver['resolveTrackUrl']>()
        .mockResolvedValue({
          ok: true,
          value: release({ title: candidateTitle, artist: 'YOASOBI' }),
        });
      const result = await createSmartLink({
        query: `YOASOBI - ${title}`,
        origin: ORIGIN,
        actor: anonymous,
        store: db.store,
        resolver: {
          ...resolver({ n: 0 }),
          resolveTrackUrl,
          async searchTracks() {
            return {
              ok: true,
              value: [
                {
                  id: 'candidate',
                  name: candidateTitle,
                  artist: 'YOASOBI',
                  url: TRACK,
                  artworkUrl: null,
                },
              ],
            };
          },
        },
      });
      expect(result.status).toBe(exact ? 'created' : 'needs_choice');
      expect(resolveTrackUrl).toHaveBeenCalledTimes(exact ? 1 : 0);
      expect(db.rows).toHaveLength(exact ? 1 : 0);
      if (!exact) expect(result.candidates?.[0]?.name).toBe(candidateTitle);
    }
  );

  it.each(['distinct', 'same'] as const)(
    'defers concurrent %s recording admission to the atomic store and reuses a winner',
    async mode => {
      const db = memory();
      await createRecording(1, db);
      await createRecording(2, db);
      const results = await Promise.all([
        createRecording(3, db),
        createRecording(mode === 'same' ? 3 : 4, db),
      ]);
      expect(results.map(result => result.status).sort()).toEqual(
        mode === 'same' ? ['created', 'existing'] : ['created', 'error']
      );
      if (mode === 'distinct')
        expect(results.find(result => result.status === 'error')?.code).toBe(
          'LIMIT_REACHED'
        );
      expect(db.rows).toHaveLength(FREE_LINKS_PER_MONTH);
      expect((await createRecording(1, db)).status).toBe('existing');
    }
  );

  it('never uses a count as pre-write authorization', async () => {
    const db = memory();
    const count = vi
      .spyOn(db.store, 'countAnonymousInMonth')
      .mockRejectedValue(new Error('No preflight count'));
    expect((await createRecording(1, db)).status).toBe('created');
    expect(count).not.toHaveBeenCalled();
  });

  it('keeps one captured timestamp and UTC month across a code conflict', async () => {
    const db = memory();
    const insert = db.store.insertWithQuota;
    const now = new Date('2026-10-31T23:59:59.999Z');
    const writes: NewStoredLink[] = [];
    db.store.insertWithQuota = async row => {
      writes.push(row);
      if (writes.length === 1) {
        now.setUTCMonth(10);
        return 'conflict';
      }
      return insert(row);
    };
    const count = vi.spyOn(db.store, 'countAnonymousInMonth');
    let code = 0;
    const result = await createRecording(1, db, {
      now,
      allocateCode: () => `retry${++code}`,
    });
    expect(result).toMatchObject({ status: 'created', code: 'retry2' });
    expect(writes).toHaveLength(2);
    for (const row of writes) {
      expect(row.createdAt.toISOString()).toBe('2026-10-31T23:59:59.999Z');
      expect(row.anonymousMonth?.toISOString()).toBe(
        '2026-10-01T00:00:00.000Z'
      );
    }
    expect(count).toHaveBeenCalledExactlyOnceWith(
      'abc123',
      new Date('2026-10-01T00:00:00Z')
    );
  });

  it('uses separate month buckets and leaves authenticated creation unlimited', async () => {
    const db = memory();
    for (let i = 1; i <= FREE_LINKS_PER_MONTH; i++)
      await createRecording(i, db);
    expect((await createRecording(4, db)).code).toBe('LIMIT_REACHED');
    expect(
      (await createRecording(4, db, { now: new Date('2026-11-01T00:00:00Z') }))
        .status
    ).toBe('created');
    for (let i = 5; i <= 8; i++) {
      expect(
        (
          await createRecording(i, db, {
            actor: { userId: 'user', anonymousSubjectHash: 'abc123' },
          })
        ).status
      ).toBe('created');
    }
    expect(
      db.rows
        .slice(-4)
        .every(
          row =>
            row.anonymousSubjectHash === null && row.anonymousMonth === null
        )
    ).toBe(true);
  });

  it('fails without a subject and bounds unresolved write conflicts', async () => {
    const db = memory();
    const insert = vi.spyOn(db.store, 'insertWithQuota');
    expect(
      (
        await createRecording(1, db, {
          actor: { userId: null, anonymousSubjectHash: null },
        })
      ).code
    ).toBe('UPSTREAM_FAILURE');
    expect(insert).not.toHaveBeenCalled();
    insert.mockResolvedValue('conflict');
    const result = await createRecording(1, db);
    expect(result).toEqual({ status: 'error', code: 'UPSTREAM_FAILURE' });
    expect(insert).toHaveBeenCalledTimes(5);
    expect(db.rows).toHaveLength(0);
    insert.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(createRecording(2, db)).rejects.toThrow('Storage unavailable');
  });

  it.each(['Upgrade', '$10 per month', 'Checkout', 'Stripe', 'Pricing', '/mo'])(
    'keeps catalog metadata %s as data after persistence and in choices',
    async title => {
      const db = memory();
      const result = await createRecording(1, db, {
        resolver: {
          ...resolver({ n: 0 }),
          async resolveIsrc() {
            return { ok: true, value: release({ title, artist: title }) };
          },
        },
      });
      expect(db.rows).toHaveLength(1);
      expect(result).toMatchObject({ status: 'created', title, artist: title });
      expect(() => assertNeutralToolResult(result)).not.toThrow();
      expect(() =>
        assertNeutralToolResult({
          status: 'existing',
          title,
          pageUrl: `https://jov.ie/artist/${encodeURIComponent(title)}`,
        })
      ).not.toThrow();
      expect(() =>
        assertNeutralToolResult({
          status: 'needs_choice',
          candidates: [
            {
              id: title,
              name: title,
              artist: title,
              url: `https://music.apple.com/track/${encodeURIComponent(title)}`,
              artworkUrl: null,
            },
          ],
        })
      ).not.toThrow();
    }
  );
});
