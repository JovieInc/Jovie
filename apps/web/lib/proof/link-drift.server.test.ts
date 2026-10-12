import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLimit, mockDb } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: mockLimit,
  };
  return { mockLimit, mockDb: { select: () => chain } };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/spotify', () => ({
  getSpotifyTracks: vi.fn(),
  getSpotifyAlbums: vi.fn(),
  getSpotifyArtistAlbums: vi.fn(),
}));

import { buildLinkDriftInput, runLinkDriftStep } from './link-drift.server';

const TRACK = '5uivx5IjCbutYpRpQvBbDk';
const album = (id: string, name: string, date: string, artist = 'artist-1') =>
  ({
    id,
    name,
    release_date: date,
    artists: [{ id: artist }],
  }) as never;

const deps = {
  getTracks: vi.fn(async () => [
    {
      id: TRACK,
      artists: [{ id: 'artist-1' }],
      album: album('old', 'Old Single', '2025-03-14'),
    },
  ]) as never,
  getAlbums: vi.fn(async () => []) as never,
  getArtistAlbums: vi.fn(async () => ({
    albums: [
      album('old', 'Old Single', '2025-03-14'),
      album('new', 'New Single', '2026-09-01'),
    ],
    total: 2,
  })) as never,
  checkHealth: vi.fn(async (urls: readonly string[]) =>
    urls.map(url => ({ url, status: 'ok' as const }))
  ),
  now: () => new Date('2026-10-04T00:00:00.000Z'),
};

describe('link drift server', () => {
  beforeEach(() => {
    mockLimit.mockReset();
    deps.checkHealth.mockClear();
  });

  it('resolves bio links to releases and skips core social hosts for health', async () => {
    const result = await buildLinkDriftInput(
      {
        bioPageUrl: 'https://bio.example/a',
        bioFetchedAt: '2026-03-31T00:00:00.000Z',
        bioLinks: [
          { url: `https://open.spotify.com/track/${TRACK}` },
          { url: 'https://www.instagram.com/someone' },
        ],
      },
      deps
    );
    expect(result.linkedReleases.map(item => item.release.id)).toEqual(['old']);
    expect(result.catalog).toHaveLength(2);
    expect(result.catalogSource).toBe(
      'https://open.spotify.com/artist/artist-1'
    );
    expect(deps.checkHealth).toHaveBeenCalledWith([
      `https://open.spotify.com/track/${TRACK}`,
    ]);
  });

  it('emits a dated, sourced drift fact for a stored bio page', async () => {
    mockLimit
      .mockResolvedValueOnce([
        {
          linktreeUrl: 'https://bio.example/a',
          allLinks: [{ url: `https://open.spotify.com/track/${TRACK}` }],
          updatedAt: new Date('2026-03-31T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ spotifyId: null, spotifyUrl: null }])
      .mockResolvedValueOnce([]);
    const artifact = await runLinkDriftStep('profile-1', deps);
    expect(artifact.empty).toBeUndefined();
    expect(artifact.facts).toEqual([
      {
        label: 'Bio link',
        value:
          'Points to “Old Single” (Mar 2025). Your latest, “New Single”, came out Sep 2026. (bio page as of Mar 31, 2026)',
        source:
          'https://bio.example/a vs https://open.spotify.com/artist/artist-1',
        observedAt: '2026-10-04T00:00:00.000Z',
      },
    ]);
  });

  it('runs empty, so the slot hides, without a stored bio page', async () => {
    mockLimit.mockResolvedValueOnce([]);
    await expect(runLinkDriftStep('profile-1', deps)).resolves.toMatchObject({
      empty: true,
      facts: [],
    });
  });
});
