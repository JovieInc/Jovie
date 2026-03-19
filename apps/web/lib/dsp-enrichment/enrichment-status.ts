/**
 * Enrichment status types and helpers.
 *
 * enrichmentStatus is stored as a per-job nested object in the profile settings JSONB:
 * { enrichmentStatus: { spotify: "complete", musicfetch: "failed", isrc: "enriching" } }
 *
 * Each background job writes ONLY its own key via atomic jsonb_set(),
 * eliminating concurrent update race conditions.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export type EnrichmentJobKey = 'spotify' | 'musicfetch' | 'isrc';
export type EnrichmentJobStatus = 'idle' | 'enriching' | 'complete' | 'failed';

export type EnrichmentStatusMap = Partial<
  Record<EnrichmentJobKey, EnrichmentJobStatus>
>;

export type AggregateEnrichmentStatus =
  | 'idle'
  | 'enriching'
  | 'complete'
  | 'partial'
  | 'failed';

/**
 * Derive aggregate enrichment status from per-job statuses.
 *
 * - All complete → complete
 * - Any enriching → enriching
 * - Mix of complete/failed → partial
 * - All failed → failed
 * - Empty/all idle → idle
 */
export function deriveAggregateStatus(
  statusMap: EnrichmentStatusMap
): AggregateEnrichmentStatus {
  const values = Object.values(statusMap);
  if (values.length === 0) return 'idle';

  const hasEnriching = values.some(s => s === 'enriching');
  const hasComplete = values.some(s => s === 'complete');
  const hasFailed = values.some(s => s === 'failed');
  const allIdle = values.every(s => s === 'idle' || s === undefined);

  if (allIdle) return 'idle';
  if (hasEnriching) return 'enriching';
  if (hasComplete && hasFailed) return 'partial';
  if (hasComplete) return 'complete';
  if (hasFailed) return 'failed';
  return 'idle';
}

/**
 * Atomically set a single enrichment job status in the profile settings JSONB.
 * Uses jsonb_set to avoid clobbering concurrent writes from other jobs.
 */
export async function setEnrichmentJobStatus(
  txOrDb: DbOrTransaction,
  profileId: string,
  jobKey: EnrichmentJobKey,
  status: EnrichmentJobStatus
): Promise<void> {
  await txOrDb.execute(drizzleSql`
    UPDATE ${creatorProfiles}
    SET
      settings = jsonb_set(
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          '{enrichmentStatus}',
          COALESCE(settings->'enrichmentStatus', '{}'::jsonb)
        ),
        ${drizzleSql.raw(`'{enrichmentStatus,${jobKey}}'`)},
        ${drizzleSql.raw(`'"${status}"'`)}::jsonb
      ),
      updated_at = NOW()
    WHERE id = ${profileId}
  `);
}

/**
 * Set all enrichment job statuses at once (used at the start of enrichment).
 */
export async function setAllEnrichmentStatuses(
  txOrDb: DbOrTransaction,
  profileId: string,
  status: EnrichmentJobStatus
): Promise<void> {
  const statusObj = JSON.stringify({
    spotify: status,
    musicfetch: status,
    isrc: status,
  });

  await txOrDb.execute(drizzleSql`
    UPDATE ${creatorProfiles}
    SET
      settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{enrichmentStatus}',
        ${drizzleSql.raw(`'${statusObj}'`)}::jsonb
      ),
      updated_at = NOW()
    WHERE id = ${profileId}
  `);
}

/** TTL in milliseconds — enriching jobs older than this are considered failed */
const ENRICHMENT_TTL_MS = 2 * 60 * 1000;

/**
 * Check enrichmentStatus for stale 'enriching' entries and transition to 'failed'.
 * Called lazily during polling reads.
 */
export function applyTtlToEnrichmentStatus(
  statusMap: EnrichmentStatusMap,
  updatedAt: Date | null
): EnrichmentStatusMap {
  if (!updatedAt) return statusMap;

  const age = Date.now() - updatedAt.getTime();
  if (age <= ENRICHMENT_TTL_MS) return statusMap;

  const result = { ...statusMap };
  let changed = false;
  for (const key of Object.keys(result) as EnrichmentJobKey[]) {
    if (result[key] === 'enriching') {
      result[key] = 'failed';
      changed = true;
    }
  }

  return changed ? result : statusMap;
}
