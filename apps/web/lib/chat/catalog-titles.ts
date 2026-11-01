import 'server-only';

import { getLiveRecordingTitles } from '@/lib/discography/live-catalog';

export const CATALOG_TRACK_TITLE_LIMIT = 2000;

/**
 * Live recording titles for the grounding guard (never archived or deleted
 * releases). Returns null when the list may be truncated or unreadable, so the
 * guard skips the title rule rather than falsely rejecting a real song.
 */
export async function fetchCatalogTrackTitlesForChat(
  profileId: string
): Promise<string[] | null> {
  try {
    const titles = await getLiveRecordingTitles(
      profileId,
      CATALOG_TRACK_TITLE_LIMIT
    );
    return titles.length >= CATALOG_TRACK_TITLE_LIMIT ? null : titles;
  } catch {
    return null;
  }
}
