import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseContext } from '@/lib/chat/types';
import { linkRow, makeChain, releaseRow, sqlTokens } from './sql-tokens';

const selectMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: () => 'missing',
}));

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
    const exactWhere = sqlTokens(recorded[0].where.mock.calls[0][0]);
    expect(exactWhere).toContain(
      'lower( discog_releases.title ) = lower( midnight )'
    );
    // Ownership + live-row predicates on the exact branch too, and
    // deterministic known-dates-first ordering for duplicate titles.
    expect(exactWhere).toContain(
      'discog_releases.creator_profile_id = profile-1'
    );
    expect(exactWhere).toContain('discog_releases.deleted_at is null');
    const [dateOrder, idOrder] = recorded[0].orderBy.mock.calls[0];
    expect(sqlTokens(dateOrder)).toBe(
      'discog_releases.release_date DESC NULLS LAST'
    );
    expect(sqlTokens(idOrder)).toBe('discog_releases.id desc');
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
    const partialWhere = sqlTokens(recorded[1].where.mock.calls[0][0]);
    expect(partialWhere).toContain('ilike');
    expect(partialWhere).toContain('%Midn%');
    // Ownership + live-row predicates on the partial branch too.
    expect(partialWhere).toContain(
      'discog_releases.creator_profile_id = profile-1'
    );
    expect(partialWhere).toContain('discog_releases.deleted_at is null');
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

describe('findOwnedReleaseForChat failure contract', () => {
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

  it('rejects when the release query fails instead of answering not-found', async () => {
    selectMock.mockImplementation(() => {
      const chain = makeChain([]);
      chain.limit.mockRejectedValue(new Error('connection reset'));
      return chain;
    });

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    await expect(
      findOwnedReleaseForChat('profile-1', { releaseTitle: 'Midnight' })
    ).rejects.toThrow('connection reset');
  });

  it('rejects when the provider-links query fails instead of answering not-found', async () => {
    const ok = makeChain([releaseRow]);
    const failing = makeChain([]);
    failing.limit.mockRejectedValue(new Error('link read failed'));
    selectMock.mockImplementation(() =>
      recorded.length === 0 ? (recorded.push(ok), ok) : failing
    );

    const { findOwnedReleaseForChat } = await import(
      '@/lib/chat/catalog-query'
    );
    await expect(
      findOwnedReleaseForChat('profile-1', { releaseTitle: 'Midnight' })
    ).rejects.toThrow('link read failed');
  });
});

describe('resolveChatRelease precedence', () => {
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

  const sliceRow = (title: string): ReleaseContext => ({
    id: releaseRow.id,
    title,
    releaseType: releaseRow.releaseType,
    releaseDate: '2026-01-01T00:00:00.000Z',
    artworkUrl: null,
    spotifyPopularity: releaseRow.spotifyPopularity,
    totalTracks: releaseRow.totalTracks,
    canvasStatus: 'not_set',
    metadata: {},
  });

  it('a full-catalog exact match beats a loaded partial (remix) match', async () => {
    // Loaded slice carries only "Midnight — Remix"; the exact "Midnight"
    // sits beyond row 50. The remix must not win without querying.
    const releases = [sliceRow('Midnight — Remix')];
    pendingRows.push([{ ...releaseRow, title: 'Midnight' }], [linkRow]);

    const { resolveChatRelease } = await import('@/lib/chat/catalog-query');
    const release = await resolveChatRelease('profile-1', releases, {
      releaseTitle: 'Midnight',
    });

    expect(release?.title).toBe('Midnight');
    // One owned resolution: the exact-title release read plus provider links.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('a local exact match wins without a database query', async () => {
    const releases = [sliceRow('Midnight'), sliceRow('Midnight — Remix')];

    const { resolveChatRelease } = await import('@/lib/chat/catalog-query');
    const release = await resolveChatRelease('profile-1', releases, {
      releaseTitle: 'Midnight',
    });

    expect(release?.title).toBe('Midnight');
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('falls back to the loaded partial match only after the database exact tier misses', async () => {
    const releases = [sliceRow('Midnight — Remix')];
    // Database exact misses, database partial misses.
    pendingRows.push([], []);

    const { resolveChatRelease } = await import('@/lib/chat/catalog-query');
    const release = await resolveChatRelease('profile-1', releases, {
      releaseTitle: 'Midnight',
    });

    expect(release?.title).toBe('Midnight — Remix');
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("match 'exact' returns null when both exact tiers miss", async () => {
    const releases = [sliceRow('Midnight — Remix')];
    pendingRows.push([], []);

    const { resolveChatRelease } = await import('@/lib/chat/catalog-query');
    const release = await resolveChatRelease('profile-1', releases, {
      releaseTitle: 'Midnight',
      match: 'exact',
    });

    expect(release).toBeNull();
  });
});

describe('resolveNamedOwnedReleasesForPrompt', () => {
  beforeEach(() => {
    selectMock.mockReset();
    selectMock.mockImplementation(() => makeChain([]));
  });

  it('ignores a short unquoted word that only happens to be a title', async () => {
    selectMock.mockImplementation(() =>
      makeChain([{ ...releaseRow, id: 'love-1', title: 'Love' }])
    );
    const { resolveNamedOwnedReleasesForPrompt } = await import(
      '@/lib/chat/catalog-query'
    );

    await expect(
      resolveNamedOwnedReleasesForPrompt([], ['I love this'], 'profile-1')
    ).resolves.toEqual([]);
  });

  it('resolves a short title when the artist quotes it', async () => {
    const chain = makeChain([{ ...releaseRow, id: 'love-1', title: 'Love' }]);
    selectMock.mockImplementation(() => chain);
    const { resolveNamedOwnedReleasesForPrompt } = await import(
      '@/lib/chat/catalog-query'
    );

    const found = await resolveNamedOwnedReleasesForPrompt(
      [],
      ['when did "Love" come out'],
      'profile-1'
    );

    expect(found.map(release => release.title)).toEqual(['Love']);
    const where = sqlTokens(chain.where.mock.calls[0][0]);
    expect(where).toContain('discog_releases.deleted_at is null');
    expect(where).toContain('strpos');
  });

  it('resolves an unquoted title at the single-word floor', async () => {
    selectMock.mockImplementation(() =>
      makeChain([{ ...releaseRow, id: 'mid-1', title: 'Midnight' }])
    );
    const { resolveNamedOwnedReleasesForPrompt } = await import(
      '@/lib/chat/catalog-query'
    );

    const found = await resolveNamedOwnedReleasesForPrompt(
      [],
      ['when did Midnight come out'],
      'profile-1'
    );

    expect(found.map(release => release.title)).toEqual(['Midnight']);
    expect(found[0]?.releaseDate).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not repeat a title already in the shown rows', async () => {
    selectMock.mockImplementation(() => makeChain([releaseRow]));
    const { resolveNamedOwnedReleasesForPrompt } = await import(
      '@/lib/chat/catalog-query'
    );
    const shown = {
      id: releaseRow.id,
      title: releaseRow.title,
      releaseType: releaseRow.releaseType,
      releaseDate: '2026-01-01T00:00:00.000Z',
      artworkUrl: null,
      spotifyPopularity: 12,
      totalTracks: 1,
      canvasStatus: 'not_set',
      metadata: {},
    } satisfies ReleaseContext;

    await expect(
      resolveNamedOwnedReleasesForPrompt(
        [shown],
        ['when did Midnight come out'],
        'profile-1'
      )
    ).resolves.toEqual([]);
  });

  it('uses a loaded row past the shown cap without a database hit when there is no profile', async () => {
    const loaded: ReleaseContext[] = Array.from({ length: 26 }, (_, index) => ({
      id: `id-${index}`,
      title: index === 25 ? 'Never Say A Word' : `Track ${index + 1}`,
      releaseType: 'single',
      releaseDate: '2025-01-01T00:00:00.000Z',
      artworkUrl: null,
      spotifyPopularity: null,
      totalTracks: 1,
      canvasStatus: 'not_set',
      metadata: {},
    }));
    const { resolveNamedOwnedReleasesForPrompt } = await import(
      '@/lib/chat/catalog-query'
    );

    const found = await resolveNamedOwnedReleasesForPrompt(
      loaded,
      ['tell me about Never Say A Word'],
      null
    );

    expect(found.map(release => release.title)).toEqual(['Never Say A Word']);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
