import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';

export type AdminPlaylistTab = 'pending' | 'published' | 'rejected';

export type AdminPlaylistRow = Awaited<
  ReturnType<typeof loadAdminPlaylists>
>[number];

export async function loadAdminPlaylists(status: AdminPlaylistTab) {
  return db
    .select({
      id: joviePlaylists.id,
      title: joviePlaylists.title,
      slug: joviePlaylists.slug,
      status: joviePlaylists.status,
      trackCount: joviePlaylists.trackCount,
      genreTags: joviePlaylists.genreTags,
      createdAt: joviePlaylists.createdAt,
      publishedAt: joviePlaylists.publishedAt,
      spotifyPlaylistId: joviePlaylists.spotifyPlaylistId,
    })
    .from(joviePlaylists)
    .where(eq(joviePlaylists.status, status))
    .orderBy(desc(joviePlaylists.createdAt))
    .limit(50);
}
