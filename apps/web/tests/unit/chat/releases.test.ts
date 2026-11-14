import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChain, releaseRow, sliceRowCompat, sqlTokens } from './sql-tokens';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: () => 'missing',
}));

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

  it('issues one catalog query per fetch call with the full total', async () => {
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
    // The single query selects the whole-catalog total via an aggregate
    // over the full filtered row set, not a second round trip.
    const selectConfig = selectMock.mock.calls[0][0] as Record<string, unknown>;
    expect('total' in selectConfig).toBe(true);
    expect(sqlTokens(selectConfig.total)).toBe('count(*) over ()');
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

describe('fetchReleasesForChat legacy wrapper', () => {
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

  it('returns the slice on a successful read', async () => {
    pendingRows.push([{ ...releaseRow, total: 1 }]);

    const { fetchReleasesForChat } = await import('@/lib/chat/releases');
    const releases = await fetchReleasesForChat('profile-1');

    expect(releases).toEqual([
      expect.objectContaining({ id: 'release-1', title: 'Midnight' }),
    ]);
  });

  it('preserves the base rejection contract on a failed read', async () => {
    // On main, fetchReleasesForChat rejected on DB failure; the mobile turn
    // handler depends on that. It must never resolve to [].
    const failing = makeChain([]);
    failing.limit.mockRejectedValue(new Error('connection reset'));
    selectMock.mockImplementation(() => failing);

    const { fetchReleasesForChat } = await import('@/lib/chat/releases');
    await expect(fetchReleasesForChat('profile-1')).rejects.toThrow();
  });
});

describe('resolveOwnedReleaseTokensForHydration', () => {
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

  it('resolves beyond-slice @release tokens through the owned query', async () => {
    const releases = [sliceRowCompat('Loaded Title')];
    pendingRows.push([{ ...releaseRow, title: 'Never Say A Word' }]);

    const { resolveOwnedReleaseTokensForHydration } = await import(
      '@/lib/chat/catalog-query'
    );
    const resolved = await resolveOwnedReleaseTokensForHydration(
      releases,
      ['Check @release:11111111-2222-3333-4444-555555555555[Never Say A Word]'],
      'profile-1'
    );

    expect(resolved.map(release => release.title)).toEqual([
      'Never Say A Word',
    ]);
    expect(sqlTokens(recorded[0].where.mock.calls[0][0])).toContain(
      'discog_releases.creator_profile_id = profile-1'
    );
  });

  it('skips tokens already in the loaded slice and deduplicates ids', async () => {
    const releases = [sliceRowCompat('Loaded Title')];
    const text =
      '@release:release-9[Other] and @release:11111111-2222-3333-4444-555555555555[Never Say A Word]';
    // Same beyond-slice id twice across texts: one query.
    pendingRows.push([releaseRow]);

    const { resolveOwnedReleaseTokensForHydration } = await import(
      '@/lib/chat/catalog-query'
    );
    await resolveOwnedReleaseTokensForHydration(
      releases,
      [text, text],
      'profile-1'
    );

    // One owned resolution: release read plus provider links.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('bounds hydration queries and skips non-release or malformed tokens', async () => {
    const releases = [] as const;
    const beyond = Array.from({ length: 10 }, (_, i) => ({
      id: `1111111${i}-2222-3333-4444-555555555555`,
    }));
    const texts = beyond.map(
      token => `@release:${token.id}[T] @track:${token.id}[T] @release:nope[T]`
    );
    pendingRows.push(
      ...Array.from({ length: 10 }, () => [[releaseRow], []]).flat()
    );

    const { resolveOwnedReleaseTokensForHydration } = await import(
      '@/lib/chat/catalog-query'
    );
    const resolved = await resolveOwnedReleaseTokensForHydration(
      releases,
      texts,
      'profile-1'
    );

    // Only well-formed release uuids beyond the slice, capped at 8 release
    // lookups (each may add one provider-links read).
    const releaseQueries = recorded.filter(
      chain =>
        chain.where.mock.calls.length > 0 &&
        sqlTokens(chain.where.mock.calls[0][0]).includes('discog_releases.id')
    );
    expect(releaseQueries).toHaveLength(8);
    expect(resolved).toHaveLength(8);
  });

  it('does not query without a profile id or release tokens', async () => {
    const { resolveOwnedReleaseTokensForHydration } = await import(
      '@/lib/chat/catalog-query'
    );

    expect(
      await resolveOwnedReleaseTokensForHydration(
        [sliceRowCompat()],
        ['no tokens here'],
        'profile-1'
      )
    ).toEqual([]);
    expect(
      await resolveOwnedReleaseTokensForHydration(
        [],
        ['@release:11111111-2222-3333-4444-555555555555[T]'],
        null
      )
    ).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
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
      "import { resolveChatRelease } from '@/lib/chat/catalog-query'"
    );
    // The in-memory-only resolver is gone; resolution is catalog-aware.
    expect(source).not.toContain('function findReleaseByTitle');
    expect(source).not.toContain('createLookupReleaseTool');
    expect(source).not.toContain('lookupRelease:');
    // The turn consumes the snapshot: slice for closures, meta for the prompt.
    expect(source).toContain(
      'const releaseCatalog = await fetchOptionalReleases(resolvedProfileId);'
    );
    expect(source).toContain('const releases = [...releaseCatalog.releases];');
    expect(source).toContain('releaseCatalog,');
    const promptPath = path.join(process.cwd(), 'lib/chat/turn-app-prompt.ts');
    const promptSource = await readFile(promptPath, 'utf8');
    expect(promptSource).toContain('resolveNamedOwnedReleasesForPrompt');
    expect(promptSource).toContain('ownProfileId: profileId');
  });
});
