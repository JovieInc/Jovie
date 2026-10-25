import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';

export const CATALOG_TRACK_TITLE_LIMIT = 2000;

/**
 * Recording titles for the grounding guard. Returns null when the list may be
 * truncated or unreadable, so the guard skips the title rule rather than
 * falsely rejecting a real song.
 */
export async function fetchCatalogTrackTitlesForChat(
  profileId: string
): Promise<string[] | null> {
  try {
    const rows = await db
      .select({ title: discogRecordings.title })
      .from(discogRecordings)
      .where(eq(discogRecordings.creatorProfileId, profileId))
      .limit(CATALOG_TRACK_TITLE_LIMIT);
    return rows.length >= CATALOG_TRACK_TITLE_LIMIT
      ? null
      : rows.map(row => row.title);
  } catch {
    return null;
  }
}
