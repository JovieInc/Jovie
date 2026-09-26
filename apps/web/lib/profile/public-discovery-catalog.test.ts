import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', email: 'email' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    avatarUrl: 'avatarUrl',
    bio: 'bio',
    isPublic: 'isPublic',
    isClaimed: 'isClaimed',
    userId: 'userId',
  },
}));

import { db } from '@/lib/db';
import {
  ARTISTS_DIRECTORY_PAGE_SIZE,
  decodeArtistsDirectoryCursor,
  encodeArtistsDirectoryCursor,
  loadArtistsDirectoryCount,
  loadArtistsDirectoryProfiles,
  toArtistsDirectoryProfiles,
} from './public-discovery-catalog';

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

interface MockSelectChain {
  limitCalls: number[];
  whereSql: string[];
  orderBySql: string[];
}

function mockDbSelectRows(rows: unknown[]): MockSelectChain {
  const dialect = new PgDialect();
  const chain: MockSelectChain & {
    from: () => unknown;
    leftJoin: () => unknown;
    where: (...args: unknown[]) => unknown;
    orderBy: (...args: unknown[]) => unknown;
    limit: (n: number) => unknown;
    then: (resolve: (v: unknown[]) => unknown) => unknown;
  } = {
    limitCalls: [],
    whereSql: [],
    orderBySql: [],
    from() {
      return chain;
    },
    leftJoin() {
      return chain;
    },
    where(...args: unknown[]) {
      for (const arg of args) {
        if (arg) chain.whereSql.push(dialect.sqlToQuery(arg as never).sql);
      }
      return chain;
    },
    orderBy(...args: unknown[]) {
      for (const arg of args) {
        chain.orderBySql.push(dialect.sqlToQuery(arg as never).sql);
      }
      return chain;
    },
    limit(n: number) {
      chain.limitCalls.push(n);
      return chain;
    },
    then(resolve: (v: unknown[]) => unknown) {
      return resolve(rows);
    },
  };
  selectMock.mockReturnValue(chain);
  return chain;
}

function makeCatalogRow(index: number) {
  return {
    id: `id-${String(index).padStart(6, '0')}`,
    username: `artist${index}`,
    displayName: `Artist ${index}`,
    avatarUrl: `/avatars/${index}.png`,
    bio: `Bio ${index}`,
    isPublic: true,
    ownerEmail: `artist${index}@creators.jov.ie`,
  };
}

describe('artists directory catalog (JOV-6260)', () => {
  it('excludes ineligible identities from the HTML directory, not only XML catalogs', () => {
    const profiles = toArtistsDirectoryProfiles([
      {
        id: 'test-realistic',
        username: 'jordanmiles',
        handle: 'jordanmiles',
        displayName: 'Jordan Miles',
        avatarUrl: 'https://cdn.jov.ie/avatars/jordan.jpg',
        bio: 'Independent artist from Nashville.',
        isPublic: true,
        ownerEmail: 'e2e+jordan@example.com',
      },
      {
        id: 'private',
        username: 'privateband',
        handle: 'privateband',
        displayName: 'Private Band',
        avatarUrl: null,
        bio: 'Keep this off the directory.',
        isPublic: false,
        ownerEmail: 'hello@privateband.com',
      },
      {
        id: 'unpublished',
        username: 'newrelease',
        handle: 'newrelease',
        displayName: 'New Release',
        avatarUrl: '/avatars/new-release.png',
        bio: 'Was public yesterday.',
        isPublic: false,
        ownerEmail: 'manager@newrelease.studio',
      },
      {
        id: 'qa-machine',
        username: 'tmoc0g1x9dwmk71',
        handle: 'tmoc0g1x9dwmk71',
        displayName: 'Jordan Miles',
        avatarUrl: '/avatars/default-user.png',
        bio: 'Looks real, minted by QA.',
        isPublic: true,
        ownerEmail: 'jordan@miles.audio',
      },
      {
        id: 'artist',
        username: 'tim',
        handle: 'tim',
        displayName: 'Tim White',
        avatarUrl: '/images/avatars/tim-white.jpg',
        bio: 'Artist',
        isPublic: true,
        ownerEmail: 'tim@timwhite.audio',
      },
      {
        id: 'non-artist',
        username: 'truecrimedaily',
        handle: 'truecrimedaily',
        displayName: 'True Crime Daily',
        avatarUrl: null,
        bio: 'Podcast',
        isPublic: true,
        ownerEmail: 'studio@truecrimedaily.com',
      },
    ]);

    expect(profiles.map(profile => profile.username)).toEqual([
      'tim',
      'truecrimedaily',
    ]);
  });

  it('drops claimed public placeholders whose display name equals the handle', () => {
    const profiles = toArtistsDirectoryProfiles([
      {
        id: 'hello',
        username: 'hello',
        handle: 'hello',
        displayName: 'hello',
        avatarUrl: null,
        bio: 'Placeholder identity.',
        isPublic: true,
        ownerEmail: 'hello@example.net',
      },
      {
        id: 'ti89m',
        username: 'ti89m',
        handle: 'ti89m',
        displayName: 'ti89m',
        avatarUrl: null,
        bio: 'Placeholder identity.',
        isPublic: true,
        ownerEmail: 'ti89m@example.net',
      },
      {
        id: 'tim1',
        username: 'tim1',
        handle: 'tim1',
        displayName: 'tim1',
        avatarUrl: null,
        bio: 'Placeholder identity.',
        isPublic: true,
        ownerEmail: 'tim1@example.net',
      },
      {
        id: 'artist',
        username: 'tim',
        handle: 'tim',
        displayName: 'Tim White',
        avatarUrl: '/images/avatars/tim-white.jpg',
        bio: 'Artist',
        isPublic: true,
        ownerEmail: 'tim@timwhite.audio',
      },
    ]);

    expect(profiles.map(profile => profile.username)).toEqual(['tim']);
  });

  it('fails closed when the eligibility source is missing', () => {
    expect(toArtistsDirectoryProfiles(undefined)).toEqual([]);
    expect(toArtistsDirectoryProfiles(null)).toEqual([]);
  });
});

describe('artists directory pagination (JOV-6451)', () => {
  it('round-trips the opaque cursor and rejects malformed input', () => {
    const cursor = { key: 'Artist 42', id: 'id-000042' };
    expect(
      decodeArtistsDirectoryCursor(encodeArtistsDirectoryCursor(cursor))
    ).toEqual(cursor);
    expect(decodeArtistsDirectoryCursor(null)).toBeNull();
    expect(decodeArtistsDirectoryCursor('')).toBeNull();
    expect(decodeArtistsDirectoryCursor('not-a-cursor')).toBeNull();
    expect(
      decodeArtistsDirectoryCursor(
        Buffer.from(JSON.stringify({ key: 'x' }), 'utf8').toString('base64url')
      )
    ).toBeNull();
  });

  it('bounds the first page, orders deterministically, and exposes a next cursor', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const overFull = ARTISTS_DIRECTORY_PAGE_SIZE + 2;
    const chain = mockDbSelectRows(
      Array.from({ length: overFull }, (_, i) => makeCatalogRow(i))
    );

    const startedAt = performance.now();
    const result = await loadArtistsDirectoryProfiles();
    const elapsedMs = performance.now() - startedAt;

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profiles.length).toBeLessThanOrEqual(
      ARTISTS_DIRECTORY_PAGE_SIZE
    );
    expect(result.nextCursor).not.toBeNull();

    // Bounded read: single LIMIT of PAGE_SIZE + 1 (never an unbounded scan).
    expect(chain.limitCalls).toEqual([ARTISTS_DIRECTORY_PAGE_SIZE + 1]);
    // Deterministic keyset order: coalesced display name, then id tiebreaker.
    // (Mocked columns compile to bound params, so assert the two-key shape.)
    expect(chain.orderBySql).toHaveLength(2);
    expect(chain.orderBySql[0]).toContain('coalesce');
    expect(chain.orderBySql[1]).toContain('asc');

    // Record bounded-work evidence: query shape, rows read, elapsed.
    const metrics = {
      limit: chain.limitCalls,
      where: chain.whereSql,
      orderBy: chain.orderBySql,
      rowsReturnedToClient: result.profiles.length,
      elapsedMs,
    };
    expect(metrics.rowsReturnedToClient).toBe(ARTISTS_DIRECTORY_PAGE_SIZE);
    expect(elapsedMs).toBeLessThan(500);
  });

  it('returns null nextCursor on the last page', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    mockDbSelectRows([makeCatalogRow(0), makeCatalogRow(1)]);

    const result = await loadArtistsDirectoryProfiles();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCursor).toBeNull();
  });

  it('applies a keyset cursor predicate instead of an offset', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const chain = mockDbSelectRows([makeCatalogRow(61)]);
    const cursor = encodeArtistsDirectoryCursor({
      key: 'Artist 60',
      id: 'id-000060',
    });

    const result = await loadArtistsDirectoryProfiles(cursor);
    expect(result.status).toBe('ok');

    const predicate = chain.whereSql.join(' ');
    // Keyset predicate: (sort_key, id) > ($key, $id) — no OFFSET, index-scanable.
    expect(predicate).toContain('>');
    expect(predicate.toLowerCase()).not.toContain('offset');
  });

  it('ignores a malformed cursor and serves the first page', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    mockDbSelectRows([makeCatalogRow(0)]);

    const result = await loadArtistsDirectoryProfiles('%%invalid%%');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profiles).toHaveLength(1);
  });

  it('runs the total as a separate bounded count query', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const chain = mockDbSelectRows([{ value: 12345 }]);

    const total = await loadArtistsDirectoryCount();
    expect(total).toBe(12345);

    // The count path never takes a LIMIT-scanned row payload.
    expect(chain.limitCalls).toEqual([]);
  });
});

describe('artists directory catalog (JOV-6126)', () => {
  it('drops empty profiles and unresolved platform-ID handles from the directory', () => {
    const profiles = toArtistsDirectoryProfiles([
      {
        id: 'duplicate',
        username: 'timwhite1',
        handle: 'timwhite1',
        displayName: 'timwhite',
        avatarUrl: null,
        bio: null,
        isPublic: true,
        ownerEmail: 'someone@timwhite.audio',
        hasPublicRelease: false,
      },
      {
        id: 'spotify-id',
        username: 'artist_5k9ywwwkldouuicvijstpl',
        handle: 'artist_5k9ywwwkldouuicvijstpl',
        displayName: 'Dave Edwards',
        avatarUrl: null,
        bio: null,
        isPublic: true,
        ownerEmail: null,
        hasPublicRelease: true,
      },
      {
        id: 'artist',
        username: 'tim',
        handle: 'tim',
        displayName: 'Tim White',
        avatarUrl: '/images/avatars/tim-white.jpg',
        bio: 'Artist',
        isPublic: true,
        ownerEmail: 'tim@timwhite.audio',
        hasPublicRelease: true,
      },
    ]);

    expect(profiles.map(profile => profile.username)).toEqual(['tim']);
  });
});
