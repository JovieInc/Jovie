import { sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';

export const audienceOwnerBackfillOptions = z.object({
  profileId: z.uuid(),
  cursor: z.uuid().nullable().default(null),
  limit: z.number().int().min(1).max(1000).default(100),
  apply: z.boolean().default(false),
});

/** One atomic, profile-scoped batch. Never rewrites a non-null owner or event data. */
export async function backfillAudienceActionOwners(
  tx: DbOrTransaction,
  input: z.input<typeof audienceOwnerBackfillOptions>
) {
  const { profileId, cursor, limit, apply } =
    audienceOwnerBackfillOptions.parse(input);
  await tx.execute("SET LOCAL lock_timeout = '5s'");
  await tx.execute("SET LOCAL statement_timeout = '30s'");
  const result = await tx.execute<{
    scanned: number;
    updated: number;
    nextCursor: string | null;
  }>(drizzleSql`
    WITH batch AS MATERIALIZED (
      SELECT a.id, m.creator_profile_id
      FROM audience_actions a
      JOIN audience_members m ON m.id = a.audience_member_id
      WHERE m.creator_profile_id = ${profileId}::uuid
        AND a.creator_profile_id IS NULL
        AND (${cursor}::uuid IS NULL OR a.id > ${cursor}::uuid)
      ORDER BY a.id LIMIT ${limit}
    ), updated AS (
      UPDATE audience_actions a SET creator_profile_id = b.creator_profile_id
      FROM batch b WHERE a.id = b.id AND a.creator_profile_id IS NULL AND ${apply}
      RETURNING a.id
    )
    SELECT (SELECT count(*)::int FROM batch) AS scanned,
      (SELECT count(*)::int FROM updated) AS updated,
      (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS "nextCursor"
  `);
  return result.rows[0];
}

/** Counts remain decimal strings: reconciliation must not lose bigint precision. */
export async function reconcileAudienceActionOwners(
  tx: DbOrTransaction,
  profileId: string
) {
  z.uuid().parse(profileId);
  const result = await tx.execute<{
    total: string;
    missing: string;
    mismatched: string;
  }>(drizzleSql`
    SELECT count(*)::text AS total,
      count(*) FILTER (WHERE a.creator_profile_id IS NULL)::text AS missing,
      count(*) FILTER (WHERE a.creator_profile_id <> m.creator_profile_id)::text AS mismatched
    FROM audience_actions a JOIN audience_members m ON m.id = a.audience_member_id
    WHERE m.creator_profile_id = ${profileId}::uuid
  `);
  return result.rows[0];
}
