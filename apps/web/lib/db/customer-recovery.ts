import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from './index';

interface ClaimCustomerRecoveryParams {
  readonly creatorProfileId: string;
  readonly spotifyUrl: string;
}

/**
 * Claims a failed profile and creates its primary recovery job in one SQL
 * statement. If another request wins the conditional update, no job is
 * inserted and the caller receives null.
 */
export async function claimAndEnqueueCustomerRecovery(
  params: ClaimCustomerRecoveryParams
): Promise<string | null> {
  const dedupKey = `musicfetch_enrichment:${params.creatorProfileId}:${crypto.randomUUID()}`;
  const payload = {
    creatorProfileId: params.creatorProfileId,
    spotifyUrl: params.spotifyUrl,
    dedupKey,
    recoveryClaimed: true,
  };

  const result = await db.execute(drizzleSql`
    WITH claimed AS (
      UPDATE creator_profiles
      SET ingestion_status = 'pending', updated_at = NOW()
      WHERE id = ${params.creatorProfileId}
        AND ingestion_status = 'failed'
      RETURNING id
    )
    INSERT INTO ingestion_jobs (
      job_type,
      payload,
      status,
      run_at,
      priority,
      attempts,
      dedup_key
    )
    SELECT
      'musicfetch_enrichment',
      ${JSON.stringify(payload)}::jsonb,
      'pending',
      NOW(),
      1,
      0,
      ${dedupKey}
    FROM claimed
    RETURNING id
  `);

  const row = result.rows[0] as { id?: unknown } | undefined;
  return typeof row?.id === 'string' ? row.id : null;
}
