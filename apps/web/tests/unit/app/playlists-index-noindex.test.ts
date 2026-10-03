/**
 * Guard test: the /playlists index is an unlinked, music-only stub that only
 * renders a "Coming soon" empty state. Until it is either deleted or rebuilt
 * as a generalized creator-collections hub, it must stay out of the search
 * index (O-10 orphan / S-04 should-not-have-shipped, JOV-7602).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('@/lib/env-server', () => ({
  env: { DATABASE_URL: undefined },
}));

vi.mock('../../../app/(dynamic)/playlists/_components/PlaylistGrid', () => ({
  PlaylistGrid: () => null,
}));

describe('/playlists index — noindex guard (JOV-7602)', () => {
  it('marks the index page with the shared NOINDEX_ROBOTS metadata', async () => {
    const [{ metadata }, { NOINDEX_ROBOTS }] = await Promise.all([
      import('../../../app/(dynamic)/playlists/page'),
      import('@/lib/seo/noindex-metadata'),
    ]);

    expect(metadata.robots).toBe(NOINDEX_ROBOTS);
  });
});
