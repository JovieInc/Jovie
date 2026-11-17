/**
 * A playlist genre or mood hub answers 404 when no published playlist carries
 * the tag, so a typed word never becomes an indexable empty page titled after
 * it. With a playlist behind it, the hub renders.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows.value),
  };
  return { db: { select: () => chain } };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('../../../app/(dynamic)/playlists/_components/PlaylistGrid', () => ({
  PlaylistGrid: () => null,
}));

const HUBS = [
  [
    'genre',
    () => import('../../../app/(dynamic)/playlists/genre/[genre]/page'),
  ],
  ['mood', () => import('../../../app/(dynamic)/playlists/mood/[mood]/page')],
] as const;

describe('playlist hubs with no published playlist', () => {
  beforeEach(() => {
    rows.value = [];
  });

  for (const [kind, load] of HUBS) {
    it(`the ${kind} hub answers 404 for a tag no playlist carries`, async () => {
      const { default: Hub } = await load();
      const params = Promise.resolve({ genre: 'zzzqq', mood: 'zzzqq' });
      await expect(Hub({ params } as never)).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it(`the ${kind} hub renders when a published playlist carries the tag`, async () => {
      rows.value = [
        {
          slug: 'late-night',
          title: 'Late Night',
          coverImageUrl: null,
          trackCount: 12,
        },
      ];
      const { default: Hub } = await load();
      const params = Promise.resolve({ genre: 'house', mood: 'chill' });
      await expect(Hub({ params } as never)).resolves.toBeTruthy();
    });
  }
});
