import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: () => 'missing',
}));

const TABLE_NAME = Symbol.for('drizzle:Name');

type SqlChunk = {
  name?: string;
  table?: { [TABLE_NAME]?: string };
  queryChunks?: unknown[];
  value?: unknown;
};

/**
 * Flattens a drizzle SQL expression (from `and`/`eq`/`isNull`/`desc`/`sql`)
 * into a single token string: column names render as `table.column`, string
 * chunks and bound values render verbatim. Mirrors the established
 * drizzle-predicate walker so assertions read like the emitted SQL.
 */
export function sqlTokens(node: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (value === null || value === undefined) return;
    // Drizzle inlines simple bound values as raw primitives in queryChunks.
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const chunk = value as SqlChunk;
    const table = chunk.table?.[TABLE_NAME];
    if (typeof chunk.name === 'string' && table) {
      parts.push(`${table}.${chunk.name}`);
      return;
    }
    if (chunk.queryChunks) {
      visit(chunk.queryChunks);
      return;
    }
    if ('value' in chunk) {
      parts.push(
        Array.isArray(chunk.value) ? chunk.value.join('') : String(chunk.value)
      );
    }
  };
  visit(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function makeChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

const releaseRow = {
  id: 'release-1',
  title: 'Midnight',
  releaseType: 'single',
  releaseDate: new Date('2026-01-01T00:00:00.000Z'),
  artworkUrl: null,
  spotifyPopularity: 12,
  totalTracks: 1,
  upc: '0123456789012',
  label: 'Night Records',
  distributor: 'Symphonic',
  metadata: {},
};

const linkRow = {
  provider: 'Spotify',
  url: 'https://open.spotify.com/album/1',
  isPrimary: true,
};

describe('fetchReleaseCatalogForChat', () => {
  let recorded: ReturnType<typeof makeChain>[];
  let pendingRows: unknown[][];

  beforeEach(() => {
    selectMock.mockReset();
    recorded = [];
    pendingRows = [];
    selectMock.mockImplementation(() => {
      const chain = makeChain(pendingRows.shift() ?? []);
      recorded.push(chain);
      return chain;
    });
  });

  it('issues one catalog query per fetch call (window count, no second round trip)', async () => {
    pendingRows.push([
      {
        id: 'release-1',
        title: 'Midnight',
        releaseType: 'single',
        releaseDate: new Date('2026-01-01T00:00:00.000Z'),
        artworkUrl: null,
        spotifyPopularity: 12,
        totalTracks: 1,
        metadata: {},
        total: 1,
      },
    ]);

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    const snapshot = await fetchReleaseCatalogForChat('profile-1');

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual({
      status: 'ok',
      total: 1,
      releases: [
        expect.objectContaining({
          id: 'release-1',
          title: 'Midnight',
          canvasStatus: 'missing',
          releaseDate: '2026-01-01T00:00:00.000Z',
        }),
      ],
    });
  });

  it('reports the whole-catalog total beyond the loaded slice (>50 records)', async () => {
    pendingRows.push(
      Array.from({ length: 50 }, (_, i) => ({
        ...releaseRow,
        id: `release-${i + 1}`,
        total: 60,
      }))
    );

    const { fetchReleaseCatalogForChat, CHAT_RELEASE_LIMIT } = await import(
      '@/lib/chat/releases'
    );
    const snapshot = await fetchReleaseCatalogForChat('profile-1');

    expect(CHAT_RELEASE_LIMIT).toBe(50);
    expect(recorded[0].limit).toHaveBeenCalledWith(50);
    expect(snapshot.status).toBe('ok');
    expect(snapshot.releases).toHaveLength(50);
    // The prompt must be able to say "60 total, 50 loaded", not "50 total".
    expect(snapshot.total).toBe(60);
  });

  it('orders known dates first with a deterministic tiebreaker (undated releases sort last)', async () => {
    pendingRows.push([]);

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    await fetchReleaseCatalogForChat('profile-1');

    const [dateOrder, idOrder] = recorded[0].orderBy.mock.calls[0];
    // Canonical library ordering (JOV-6272): DESC NULLS LAST keeps undated
    // duplicates from crowding out dated releases, id breaks ties.
    expect(sqlTokens(dateOrder)).toBe(
      'discog_releases.release_date DESC NULLS LAST'
    );
    expect(sqlTokens(idOrder)).toBe('discog_releases.id desc');
  });

  it('scopes the catalog to the requesting profile (cross-profile isolation)', async () => {
    pendingRows.push([]);

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    await fetchReleaseCatalogForChat('profile-1');

    const whereArg = recorded[0].where.mock.calls[0][0];
    expect(sqlTokens(whereArg)).toContain(
      'discog_releases.creator_profile_id = profile-1'
    );
  });

  it('excludes archived (soft-deleted) releases', async () => {
    pendingRows.push([]);

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    await fetchReleaseCatalogForChat('profile-1');

    const whereArg = recorded[0].where.mock.calls[0][0];
    expect(sqlTokens(whereArg)).toContain('discog_releases.deleted_at is null');
  });

  it('reports the catalog as unavailable when the read fails (never "none exist")', async () => {
    selectMock.mockImplementation(() => {
      const chain = makeChain([]);
      chain.limit.mockRejectedValue(new Error('connection reset'));
      return chain;
    });

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    const snapshot = await fetchReleaseCatalogForChat('profile-1');

    expect(snapshot).toEqual({
      status: 'unavailable',
      total: null,
      releases: [],
    });
  });

  it('reports total 0 for a genuinely empty catalog', async () => {
    pendingRows.push([]);

    const { fetchReleaseCatalogForChat } = await import('@/lib/chat/releases');
    const snapshot = await fetchReleaseCatalogForChat('profile-1');

    expect(snapshot).toEqual({ status: 'ok', total: 0, releases: [] });
  });
});

describe('findOwnedReleaseForChat', () => {
  let recorded: ReturnType<typeof makeChain>[];
  let pendingRows: unknown[][];

  beforeEach(() => {
    selectMock.mockReset();
    recorded = [];
    pendingRows = [];
    selectMock.mockImplementation(() => {
      const chain = makeChain(pendingRows.shift() ?? []);
      recorded.push(chain);
      return chain;
    });
  });

  it('resolves an owned release by id with date/type/identity and provider evidence', async () => {
    pendingRows.push([releaseRow], [linkRow]);

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {
      releaseId: '11111111-2222-3333-4444-555555555555',
    });

    const releaseWhere = sqlTokens(recorded[0].where.mock.calls[0][0]);
    expect(releaseWhere).toContain(
      'discog_releases.creator_profile_id = profile-1'
    );
    expect(releaseWhere).toContain('discog_releases.deleted_at is null');
    expect(releaseWhere).toContain(
      'discog_releases.id = 11111111-2222-3333-4444-555555555555'
    );

    const linksWhere = sqlTokens(recorded[1].where.mock.calls[0][0]);
    expect(linksWhere).toContain('provider_links.owner_type = release');
    expect(linksWhere).toContain('provider_links.release_id = release-1');

    expect(release).toEqual(
      expect.objectContaining({
        id: 'release-1',
        title: 'Midnight',
        releaseType: 'single',
        releaseDate: '2026-01-01T00:00:00.000Z',
        upc: '0123456789012',
        label: 'Night Records',
        distributor: 'Symphonic',
        canvasStatus: 'missing',
        providerLinks: [
          {
            provider: 'Spotify',
            url: 'https://open.spotify.com/album/1',
            isPrimary: true,
          },
        ],
      })
    );
  });

  it('tries an exact case-insensitive title match before a partial one', async () => {
    pendingRows.push([releaseRow], [linkRow]);

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {
      releaseTitle: 'midnight',
    });

    // Exactly two queries: the exact-title release read, then provider links.
    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(sqlTokens(recorded[0].where.mock.calls[0][0])).toContain(
      'lower( discog_releases.title ) = lower( midnight )'
    );
    expect(release?.title).toBe('Midnight');
  });

  it('falls back to a partial title match beyond the prompt slice', async () => {
    pendingRows.push([], [releaseRow], [linkRow]);

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {
      releaseTitle: 'Midn',
    });

    expect(selectMock).toHaveBeenCalledTimes(3);
    expect(sqlTokens(recorded[1].where.mock.calls[0][0])).toContain('ilike');
    expect(sqlTokens(recorded[1].where.mock.calls[0][0])).toContain('%Midn%');
    expect(release?.title).toBe('Midnight');
  });

  it('returns null without querying when no id or title is given', async () => {
    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {});

    expect(release).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns null for a malformed release id without querying', async () => {
    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {
      releaseId: 'not-a-uuid',
    });

    expect(release).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns null when no owned release matches', async () => {
    pendingRows.push([], []);

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    const release = await findOwnedReleaseForChat('profile-1', {
      releaseTitle: 'Unknown Title',
    });

    expect(release).toBeNull();
  });
});

describe('chat route release-query wiring', () => {
  it('does not call fetchReleaseCatalogForChat inside tool executors', async () => {
    const routePath = path.join(process.cwd(), 'app/api/chat/route.ts');
    const source = await readFile(routePath, 'utf8');
    const matches = source.match(/fetchReleaseCatalogForChat/g) ?? [];

    expect(matches).toHaveLength(2);
    expect(source).toContain(
      "import { fetchReleaseCatalogForChat } from '@/lib/chat/releases'"
    );
    expect(source).toContain('return fetchReleaseCatalogForChat(profileId);');
    expect(source).not.toContain(
      'await fetchReleaseCatalogForChat(params.profileId)'
    );
    expect(source).not.toContain(
      'await fetchReleaseCatalogForChat(resolvedProfileId)'
    );
  });

  it('resolves owned releases beyond the prompt slice through the catalog query', async () => {
    const routePath = path.join(process.cwd(), 'app/api/chat/route.ts');
    const source = await readFile(routePath, 'utf8');

    expect(source).toContain(
      "import { findOwnedReleaseForChat } from '@/lib/chat/catalog-query'"
    );
    // The turn consumes the snapshot: slice for closures, meta for the prompt.
    expect(source).toContain(
      'const releaseCatalog = await fetchOptionalReleases(resolvedProfileId);'
    );
    expect(source).toContain('const releases = [...releaseCatalog.releases];');
    expect(source).toContain('releaseCatalog,');
  });
});
