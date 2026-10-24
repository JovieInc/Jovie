/**
 * Plan for repairing stored release credits whose Spotify artist id
 * conflicts with the release's provider (Spotify) artist list while the
 * display names match (JOVIE-WEB-W3). Pure so it can be unit tested; the
 * script in scripts/backfill-credit-spotify-ids.ts does the I/O.
 */

export interface CreditConflictRow {
  readonly releaseArtistId: string;
  readonly releaseId: string;
  readonly artistId: string;
  readonly artistName: string;
  readonly storedSpotifyId: string | null;
  readonly providerSpotifyId: string;
  /** Artist row that already owns providerSpotifyId, if any. */
  readonly ownerArtistId: string | null;
  /** True when the release already credits ownerArtistId in the same role. */
  readonly ownerAlreadyCredited: boolean;
  /** Auto-created external collaborator with no linked Jovie profile. */
  readonly artistIsUnclaimedAutoCreated: boolean;
}

export type CreditRepair =
  | {
      readonly kind: 'repoint_credit';
      readonly releaseArtistId: string;
      readonly fromArtistId: string;
      readonly toArtistId: string;
    }
  | {
      readonly kind: 'set_artist_spotify_id';
      readonly artistId: string;
      readonly fromSpotifyId: string | null;
      readonly toSpotifyId: string;
    }
  | { readonly kind: 'skip'; readonly reason: string; readonly row: string };

export function planCreditSpotifyIdRepairs(
  rows: readonly CreditConflictRow[]
): CreditRepair[] {
  const repairs: CreditRepair[] = [];
  const claimedSpotifyIds = new Set<string>();
  const touchedArtists = new Set<string>();

  for (const row of rows) {
    if (row.storedSpotifyId === row.providerSpotifyId) continue;

    if (row.ownerArtistId && row.ownerArtistId !== row.artistId) {
      if (row.ownerAlreadyCredited) {
        repairs.push({
          kind: 'skip',
          reason: 'owner_already_credited',
          row: row.releaseArtistId,
        });
        continue;
      }
      repairs.push({
        kind: 'repoint_credit',
        releaseArtistId: row.releaseArtistId,
        fromArtistId: row.artistId,
        toArtistId: row.ownerArtistId,
      });
      continue;
    }

    if (!row.artistIsUnclaimedAutoCreated) {
      repairs.push({
        kind: 'skip',
        reason: 'artist_claimed_or_manual',
        row: row.releaseArtistId,
      });
      continue;
    }
    if (
      claimedSpotifyIds.has(row.providerSpotifyId) ||
      touchedArtists.has(row.artistId)
    ) {
      repairs.push({
        kind: 'skip',
        reason: 'ambiguous_multiple_targets',
        row: row.releaseArtistId,
      });
      continue;
    }
    claimedSpotifyIds.add(row.providerSpotifyId);
    touchedArtists.add(row.artistId);
    repairs.push({
      kind: 'set_artist_spotify_id',
      artistId: row.artistId,
      fromSpotifyId: row.storedSpotifyId,
      toSpotifyId: row.providerSpotifyId,
    });
  }

  return repairs;
}

export function summarizeRepairs(repairs: readonly CreditRepair[]) {
  const summary: Record<string, number> = {
    repoint_credit: 0,
    set_artist_spotify_id: 0,
  };
  for (const repair of repairs) {
    const key = repair.kind === 'skip' ? `skip:${repair.reason}` : repair.kind;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}
