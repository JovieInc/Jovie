import { sql as drizzleSql } from 'drizzle-orm';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';
import { withSerializableRetry } from '@/lib/db/serializable-retry';

export interface SwapProfileSurfaceMonitoringInput {
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly activateSurfaceId: string;
  readonly pauseSurfaceId?: string | null;
  readonly limit: number | null;
}

/**
 * Atomically activates one account-scoped surface preference.
 *
 * A serializable transaction plus an account-scoped advisory lock prevents
 * concurrent swaps from observing the same remaining quota slot. The caller
 * must derive user/profile IDs from the authenticated session.
 */
export async function swapProfileSurfaceMonitoring(
  input: SwapProfileSurfaceMonitoringInput
): Promise<boolean> {
  const effectiveLimit = input.limit ?? 2_147_483_647;
  if (effectiveLimit <= 0) return false;
  if (input.pauseSurfaceId === input.activateSurfaceId) return false;

  const result = await withSerializableRetry(() =>
    runLegacyDbTransaction(async tx => {
      await tx.execute(
        drizzleSql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
      );

      return tx.execute(drizzleSql`
    WITH target AS MATERIALIZED (
      SELECT id
      FROM profile_surfaces
      WHERE id = ${input.activateSurfaceId}::uuid
        AND creator_profile_id = ${input.creatorProfileId}::uuid
        AND kind <> 'jovie'
        AND availability = 'eligible'
        AND retired_at IS NULL
    ),
    account_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${input.userId}::text || ':' || ${input.creatorProfileId}::text,
          0
        )
      )
      FROM target
    ),
    paused AS (
      UPDATE profile_surface_monitoring_preferences
      SET state = 'paused', user_paused = true, updated_at = now()
      WHERE user_id = ${input.userId}::uuid
        AND creator_profile_id = ${input.creatorProfileId}::uuid
        AND surface_id = ${input.pauseSurfaceId ?? null}::uuid
        AND EXISTS (SELECT 1 FROM account_lock)
      RETURNING surface_id
    ),
    active_count AS MATERIALIZED (
      SELECT count(*)::integer AS count
      FROM profile_surface_monitoring_preferences, account_lock
      WHERE user_id = ${input.userId}::uuid
        AND creator_profile_id = ${input.creatorProfileId}::uuid
        AND state = 'active'
        AND surface_id <> ${input.activateSurfaceId}::uuid
        AND (
          ${input.pauseSurfaceId ?? null}::uuid IS NULL
          OR surface_id <> ${input.pauseSurfaceId ?? null}::uuid
        )
    ),
    activated AS (
      INSERT INTO profile_surface_monitoring_preferences (
        user_id,
        creator_profile_id,
        surface_id,
        state,
        user_paused,
        updated_at
      )
      SELECT
        ${input.userId}::uuid,
        ${input.creatorProfileId}::uuid,
        target.id,
        'active',
        false,
        now()
      FROM target, account_lock, active_count
      WHERE active_count.count < ${effectiveLimit}
      ON CONFLICT (user_id, surface_id) DO UPDATE
      SET state = 'active', user_paused = false, updated_at = now()
      RETURNING surface_id
    )
    SELECT surface_id FROM activated
      `);
    })
  );

  return result.rows.length === 1;
}
