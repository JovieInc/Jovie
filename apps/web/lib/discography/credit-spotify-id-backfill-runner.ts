/**
 * JOVIE-WEB-W3 backfill runner: repair release credits whose stored Spotify
 * artist id conflicts with the release's Spotify artist list for the same
 * name. Idempotent (repaired rows stop matching; updates are compare-and-set)
 * and non-destructive (previous ids kept in metadata.creditBackfill).
 */
import { sql as drizzleSql } from 'drizzle-orm';
import {
  type CreditConflictRow,
  planCreditSpotifyIdRepairs,
  summarizeRepairs,
} from './credit-spotify-id-backfill';

const SOURCE = 'jovie-web-w3-credit-spotify-id';

type SqlQuery = ReturnType<typeof drizzleSql>;

export interface BackfillDb {
  execute(query: SqlQuery): Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>;
  /** Runs one short atomic write; wired to runAtomicDbOperation in production. */
  atomic<T>(fn: (tx: Pick<BackfillDb, 'execute'>) => Promise<T>): Promise<T>;
}

export function toConflictRow(row: Record<string, unknown>): CreditConflictRow {
  return {
    releaseArtistId: String(row.release_artist_id),
    releaseId: String(row.release_id),
    artistId: String(row.artist_id),
    artistName: String(row.artist_name),
    storedSpotifyId: (row.stored_spotify_id as string | null) ?? null,
    providerSpotifyId: String(row.provider_spotify_id),
    ownerArtistId: (row.owner_artist_id as string | null) ?? null,
    ownerAlreadyCredited: Boolean(row.owner_already_credited),
    artistIsUnclaimedAutoCreated: Boolean(row.artist_is_unclaimed_auto_created),
  };
}

async function loadConflicts(db: BackfillDb): Promise<CreditConflictRow[]> {
  const result = await db.execute(drizzleSql`
    WITH provider AS (
      SELECT r.id AS release_id,
             btrim(sa->>'name') AS name,
             sa->>'id' AS spotify_id
      FROM discog_releases r,
           jsonb_array_elements(
             CASE WHEN jsonb_typeof(r.metadata->'spotifyArtists') = 'array'
                  THEN r.metadata->'spotifyArtists' ELSE '[]'::jsonb END
           ) sa
      WHERE coalesce(sa->>'id', '') <> ''
    )
    SELECT ra.id AS release_artist_id,
           ra.release_id,
           a.id AS artist_id,
           a.name AS artist_name,
           a.spotify_id AS stored_spotify_id,
           p.spotify_id AS provider_spotify_id,
           owner.id AS owner_artist_id,
           EXISTS (
             SELECT 1 FROM release_artists ra2
             WHERE ra2.release_id = ra.release_id
               AND ra2.artist_id = owner.id
               AND ra2.role = ra.role
           ) AS owner_already_credited,
           (a.is_auto_created AND a.creator_profile_id IS NULL)
             AS artist_is_unclaimed_auto_created
    FROM release_artists ra
    JOIN artists a ON a.id = ra.artist_id
    JOIN provider p
      ON p.release_id = ra.release_id
     AND lower(regexp_replace(btrim(coalesce(ra.credit_name, a.name)), '\\s+', ' ', 'g'))
       = lower(regexp_replace(p.name, '\\s+', ' ', 'g'))
    LEFT JOIN artists owner ON owner.spotify_id = p.spotify_id
    WHERE ra.role = 'main_artist'
      AND a.spotify_id IS NOT NULL
      AND a.spotify_id <> p.spotify_id
    ORDER BY ra.release_id, ra.position
  `);
  return result.rows.map(toConflictRow);
}

export interface BackfillReport {
  readonly mode: 'apply' | 'dry-run';
  readonly conflictingCredits: number;
  readonly releasesAffected: number;
  readonly plan: Record<string, number>;
  readonly appliedRows: number;
}

/** Dry run unless apply is true. Never logs ids or row contents. */
export async function runCreditSpotifyIdBackfill(
  db: BackfillDb,
  options: { readonly apply: boolean }
): Promise<BackfillReport> {
  const APPLY = options.apply;
  const conflicts = await loadConflicts(db);
  const repairs = planCreditSpotifyIdRepairs(conflicts);
  const releases = new Set(conflicts.map(row => row.releaseId)).size;
  const report = {
    mode: APPLY ? ('apply' as const) : ('dry-run' as const),
    conflictingCredits: conflicts.length,
    releasesAffected: releases,
    plan: summarizeRepairs(repairs),
    appliedRows: 0,
  };
  if (!APPLY) return report;

  let applied = 0;
  // One atomic compare-and-set write per repair: each is idempotent, so a
  // partial run is safe to re-run and no single transaction outlives its timeout.
  for (const repair of repairs) {
    await db.atomic(async tx => {
      if (repair.kind === 'repoint_credit') {
        const res = await tx.execute(drizzleSql`
          UPDATE release_artists
          SET artist_id = ${repair.toArtistId},
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'creditBackfill', jsonb_build_object(
                  'source', ${SOURCE}, 'previousArtistId', ${repair.fromArtistId}::text,
                  'at', now()))
          WHERE id = ${repair.releaseArtistId}
            AND artist_id = ${repair.fromArtistId}
        `);
        applied += res.rowCount ?? 0;
      } else if (repair.kind === 'set_artist_spotify_id') {
        const res = await tx.execute(drizzleSql`
          UPDATE artists
          SET spotify_id = ${repair.toSpotifyId},
              updated_at = now(),
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'creditBackfill', jsonb_build_object(
                  'source', ${SOURCE}, 'previousSpotifyId', ${repair.fromSpotifyId}::text,
                  'at', now()))
          WHERE id = ${repair.artistId}
            AND spotify_id IS NOT DISTINCT FROM ${repair.fromSpotifyId}
            AND NOT EXISTS (SELECT 1 FROM artists WHERE spotify_id = ${repair.toSpotifyId})
        `);
        applied += res.rowCount ?? 0;
      }
    });
  }
  return { ...report, appliedRows: applied };
}
