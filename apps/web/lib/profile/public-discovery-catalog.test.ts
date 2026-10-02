import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { cacheEntries } = vi.hoisted(() => ({
  cacheEntries: new Map<string, unknown>(),
}));
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (cacheEntries.has(key)) return cacheEntries.get(key);
      const value = await fn(...args);
      cacheEntries.set(key, value);
      return value;
    },
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@/lib/db', async () => ({
  db: { select: vi.fn() },
  withRetry: (await import('@/lib/db/client/retry')).withRetry,
}));
vi.mock('@/lib/db/client/circuit-breaker', () => ({
  dbCircuitBreaker: {
    execute: (operation: () => Promise<unknown>) => operation(),
  },
}));
vi.mock('@/lib/db/client/logging', () => ({
  logDbError: vi.fn(),
  logDbInfo: vi.fn(),
}));
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

import { captureException } from '@sentry/nextjs';
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
  reads: number;
}

function mockDbSelectBatches(batches: (unknown[] | Error)[]): MockSelectChain {
  let callIndex = 0;
  const dialect = new PgDialect();
  const chain: MockSelectChain & {
    from: () => unknown;
    leftJoin: () => unknown;
    where: (...args: unknown[]) => unknown;
    orderBy: (...args: unknown[]) => unknown;
    limit: (n: number) => unknown;
    then: (
      resolve: (v: unknown[]) => unknown,
      reject: (error: unknown) => unknown
    ) => unknown;
  } = {
    reads: 0,
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
    then(
      resolve: (v: unknown[]) => unknown,
      reject: (error: unknown) => unknown
    ) {
      chain.reads++;
      const value = batches[callIndex++] ?? [];
      return value instanceof Error
        ? Promise.reject(value).then(resolve, reject)
        : Promise.resolve(value).then(resolve, reject);
    },
  };
  selectMock.mockReturnValue(chain);
  return chain;
}

function mockDbSelectRows(rows: unknown[]): MockSelectChain {
  return mockDbSelectBatches([rows]);
}

function makeIneligibleCatalogRow(index: number) {
  const handle = `placeholder${index}`;
  return {
    ...makeCatalogRow(index),
    username: handle,
    displayName: handle,
  };
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

beforeEach(() => {
  cacheEntries.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

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

  it('keeps scanning until the page fills with eligible profiles (JOV-6939)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    // First raw batch is entirely ineligible (placeholder identities); the
    // eligible profiles live beyond it. A raw-row page bound would render an
    // empty page with a dangling next cursor.
    mockDbSelectBatches([
      Array.from({ length: ARTISTS_DIRECTORY_PAGE_SIZE + 1 }, (_, i) =>
        makeIneligibleCatalogRow(i)
      ),
      [makeCatalogRow(100), makeCatalogRow(101)],
    ]);

    const result = await loadArtistsDirectoryProfiles();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profiles.map(profile => profile.username)).toEqual([
      'artist100',
      'artist101',
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('does not emit a nextCursor when all remaining rows are ineligible (JOV-6939)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    // Raw lookahead says "more rows", but every one is filtered out — the
    // cursor must be null so "Load more" never leads to an empty dead end.
    mockDbSelectBatches([
      [
        makeCatalogRow(0),
        ...Array.from({ length: ARTISTS_DIRECTORY_PAGE_SIZE }, (_, i) =>
          makeIneligibleCatalogRow(i + 1)
        ),
      ],
      [],
    ]);

    const result = await loadArtistsDirectoryProfiles();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profiles).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('emits a nextCursor only when another eligible profile exists', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    mockDbSelectBatches([
      Array.from({ length: ARTISTS_DIRECTORY_PAGE_SIZE + 1 }, (_, i) =>
        i === ARTISTS_DIRECTORY_PAGE_SIZE
          ? makeIneligibleCatalogRow(i)
          : makeCatalogRow(i)
      ),
      [makeCatalogRow(200)],
    ]);

    const result = await loadArtistsDirectoryProfiles();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.profiles).toHaveLength(ARTISTS_DIRECTORY_PAGE_SIZE);
    expect(result.nextCursor).not.toBeNull();

    const decoded = decodeArtistsDirectoryCursor(result.nextCursor);
    expect(decoded).toEqual({
      key: `Artist ${ARTISTS_DIRECTORY_PAGE_SIZE - 1}`,
      id: `id-${String(ARTISTS_DIRECTORY_PAGE_SIZE - 1).padStart(6, '0')}`,
    });
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

  it('counts only the identities the directory renders (JOV-6435)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const chain = mockDbSelectRows([
      makeCatalogRow(0),
      makeCatalogRow(1),
      {
        ...makeCatalogRow(2),
        username: 'tim1',
        displayName: 'tim1',
        hasPublicRelease: true,
      },
      {
        ...makeCatalogRow(3),
        username: 'timwhite1',
        hasPublicRelease: false,
      },
      { ...makeCatalogRow(4), ownerEmail: 'e2e+qa@jov.ie' },
    ]);

    const total = await loadArtistsDirectoryCount();

    // Placeholder identity, empty profile, and test-account rows are excluded,
    // matching the rendered card list instead of the raw claimed-public count.
    expect(total).toBe(2);
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

describe('artists directory connection recovery (JOV-6868)', () => {
  function connectionTimeout() {
    return new Error('Failed query: select creator_profiles', {
      cause: new Error('Connection terminated due to connection timeout'),
    });
  }

  it('retries a nested connection failure and caches the recovered profile page', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    vi.useFakeTimers();
    const chain = mockDbSelectBatches([
      connectionTimeout(),
      [makeCatalogRow(0)],
    ]);
    const pending = loadArtistsDirectoryProfiles();
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result).toMatchObject({
      status: 'ok',
      profiles: [{ username: 'artist0' }],
      nextCursor: null,
    });
    expect(await loadArtistsDirectoryProfiles()).toEqual(result);
    expect(chain.reads).toBe(2);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('bounds retries and recovers on the next request instead of caching unavailable', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    vi.useFakeTimers();
    const error = connectionTimeout();
    const chain = mockDbSelectBatches([error, error, [makeCatalogRow(1)]]);
    const pending = loadArtistsDirectoryProfiles();
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ status: 'unavailable' });
    expect(chain.reads).toBe(2);
    expect(cacheEntries.size).toBe(0);
    expect(captureException).toHaveBeenCalledWith(error);
    expect(await loadArtistsDirectoryProfiles()).toMatchObject({
      status: 'ok',
      profiles: [{ username: 'artist1' }],
    });
    expect(chain.reads).toBe(3);
  });

  it('does not retry a permanent query failure or cache its fallback', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const error = new Error('column does not exist');
    const chain = mockDbSelectBatches([error, [makeCatalogRow(2)]]);
    expect(await loadArtistsDirectoryProfiles()).toEqual({
      status: 'unavailable',
    });
    expect(chain.reads).toBe(1);
    expect(await loadArtistsDirectoryProfiles()).toMatchObject({
      status: 'ok',
    });
    expect(chain.reads).toBe(2);
  });

  it('keeps cursor pages isolated in the success cache', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const chain = mockDbSelectBatches([
      [makeCatalogRow(0)],
      [makeCatalogRow(1)],
    ]);
    const first = await loadArtistsDirectoryProfiles();
    const next = await loadArtistsDirectoryProfiles(
      encodeArtistsDirectoryCursor({ key: 'Artist 0', id: 'id-000000' })
    );
    expect(first).toMatchObject({ profiles: [{ username: 'artist0' }] });
    expect(next).toMatchObject({ profiles: [{ username: 'artist1' }] });
    expect(await loadArtistsDirectoryProfiles()).toEqual(first);
    expect(chain.reads).toBe(2);
  });

  it('retries the count but never caches null after an exhausted connection failure', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    vi.useFakeTimers();
    const error = connectionTimeout();
    const chain = mockDbSelectBatches([
      error,
      error,
      error,
      [makeCatalogRow(0)],
    ]);
    const failed = loadArtistsDirectoryCount();
    await vi.runAllTimersAsync();
    expect(await failed).toBeNull();
    expect(chain.reads).toBe(2);
    expect(cacheEntries.size).toBe(0);
    const recovered = loadArtistsDirectoryCount();
    await vi.runAllTimersAsync();
    expect(await recovered).toBe(1);
    expect(await loadArtistsDirectoryCount()).toBe(1);
    expect(chain.reads).toBe(4);
  });

  it('caches successful empty results while missing configuration stays uncached', async () => {
    vi.stubEnv('DATABASE_URL', undefined);
    expect(await loadArtistsDirectoryProfiles()).toEqual({
      status: 'unavailable',
    });
    expect(await loadArtistsDirectoryCount()).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
    expect(cacheEntries.size).toBe(0);
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    const chain = mockDbSelectBatches([[], []]);
    for (let request = 0; request < 2; request++) {
      expect(await loadArtistsDirectoryProfiles()).toEqual({
        status: 'ok',
        profiles: [],
        nextCursor: null,
      });
      expect(await loadArtistsDirectoryCount()).toBe(0);
    }
    expect(chain.reads).toBe(2);
  });
});
