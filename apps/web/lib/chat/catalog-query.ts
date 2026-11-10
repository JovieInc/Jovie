import 'server-only';

import { and, asc, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  discogReleases,
  providerLinks,
  providers,
} from '@/lib/db/schema/content';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrNull } from '@/lib/utils/date';
import type { ChatReleaseLookup } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cap on provider-link evidence per lookup; keeps tool output bounded. */
const PROVIDER_LINK_LIMIT = 20;

function releaseColumns() {
  return {
    id: discogReleases.id,
    title: discogReleases.title,
    releaseType: discogReleases.releaseType,
    releaseDate: discogReleases.releaseDate,
    artworkUrl: discogReleases.artworkUrl,
    spotifyPopularity: discogReleases.spotifyPopularity,
    totalTracks: discogReleases.totalTracks,
    upc: discogReleases.upc,
    label: discogReleases.label,
    distributor: discogReleases.distributor,
    metadata: discogReleases.metadata,
  };
}

type ReleaseRow = {
  id: string;
  title: string;
  releaseType: string;
  releaseDate: Date | string | null;
  artworkUrl: string | null;
  spotifyPopularity: number | null;
  totalTracks: number;
  upc: string | null;
  label: string | null;
  distributor: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Owned release lookup for chat tool executors, against the FULL catalog
 * rather than the per-turn prompt slice (dogfood 2026-11-10: a release past
 * the 50-row slice was reported as "not found").
 *
 * - Scoped to `profileId` and live rows only (soft-deleted/archived excluded),
 *   so a lookup can never resolve another artist's release.
 * - Title matching mirrors the in-memory resolver: exact (case-insensitive)
 *   first, then substring. Deterministic ordering (`releaseDate DESC NULLS
 *   LAST`, id desc) so duplicate or undated titles resolve consistently.
 * - Returns identity + catalog identifiers + provider links so tool output
 *   can ground statements about the release with evidence.
 * - Throws on DB failure: callers surface a tool error rather than a false
 *   "not found".
 */
export async function findOwnedReleaseForChat(
  profileId: string,
  input: { releaseId?: string; releaseTitle?: string }
): Promise<ChatReleaseLookup | null> {
  const releaseId = input.releaseId?.trim();
  const releaseTitle = input.releaseTitle?.trim();
  if (!releaseId && !releaseTitle) return null;

  const ownership = and(
    eq(discogReleases.creatorProfileId, profileId),
    isNull(discogReleases.deletedAt)
  );

  let row: ReleaseRow | undefined;

  if (releaseId) {
    // Guard the uuid column: a malformed id would throw at the DB boundary
    // where the in-memory resolver used to return null.
    if (!UUID_PATTERN.test(releaseId)) return null;
    const rows = await db
      .select(releaseColumns())
      .from(discogReleases)
      .where(and(ownership, eq(discogReleases.id, releaseId)))
      .limit(1);
    row = rows[0];
  } else if (releaseTitle) {
    const exact = await db
      .select(releaseColumns())
      .from(discogReleases)
      .where(
        and(
          ownership,
          sql`lower(${discogReleases.title}) = lower(${releaseTitle})`
        )
      )
      .limit(1);
    row = exact[0];
    if (!row) {
      const escaped = releaseTitle.replaceAll(/[\\%_]/g, match => `\\${match}`);
      const partial = await db
        .select(releaseColumns())
        .from(discogReleases)
        .where(and(ownership, ilike(discogReleases.title, `%${escaped}%`)))
        .orderBy(
          sql`${discogReleases.releaseDate} DESC NULLS LAST`,
          desc(discogReleases.id)
        )
        .limit(1);
      row = partial[0];
    }
  } else {
    return null;
  }

  if (!row) return null;

  const links = await db
    .select({
      provider: providers.displayName,
      url: providerLinks.url,
      isPrimary: providerLinks.isPrimary,
    })
    .from(providerLinks)
    .innerJoin(providers, eq(providers.id, providerLinks.providerId))
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, row.id)
      )
    )
    // Primary links first, then a stable alphabetical order.
    .orderBy(desc(providerLinks.isPrimary), asc(providers.displayName))
    .limit(PROVIDER_LINK_LIMIT);

  return {
    ...row,
    releaseDate: toISOStringOrNull(row.releaseDate),
    canvasStatus: getCanvasStatusFromMetadata(row.metadata),
    providerLinks: links.map(link => ({
      provider: link.provider,
      url: link.url,
      isPrimary: link.isPrimary,
    })),
  };
}
