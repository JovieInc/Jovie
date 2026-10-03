import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('@/lib/env-server', () => ({
  env: { DATABASE_URL: undefined },
}));

vi.mock('@/app/(dynamic)/playlists/_components/PlaylistGrid', () => ({
  PlaylistGrid: () => null,
}));

describe('playlists index', () => {
  it('stays out of search indexes until a creator-generic collection exists', async () => {
    const { metadata } = await import('@/app/(dynamic)/playlists/page');

    expect(metadata?.robots).toEqual({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });
});
