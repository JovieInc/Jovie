import { desc, eq, or } from 'drizzle-orm';
import type { IngestHistoryRow } from '@/components/admin/ingest-history.types';
import { getDb } from '@/lib/db';
import { ingestAuditLogs } from '@/lib/db/schema/audit';

/**
 * Fetch recent admin ingest audit log entries.
 * Returns the most recent ingest events (claims and batch ingests).
 */
export async function getRecentIngestHistory(
  limit = 50
): Promise<IngestHistoryRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: ingestAuditLogs.id,
      type: ingestAuditLogs.type,
      handle: ingestAuditLogs.handle,
      spotifyId: ingestAuditLogs.spotifyId,
      result: ingestAuditLogs.result,
      failureReason: ingestAuditLogs.failureReason,
      createdAt: ingestAuditLogs.createdAt,
    })
    .from(ingestAuditLogs)
    .where(
      or(
        eq(ingestAuditLogs.type, 'ARTIST_CLAIM_SUCCESS'),
        eq(ingestAuditLogs.type, 'ARTIST_CLAIM_FAILED'),
        eq(ingestAuditLogs.type, 'ARTIST_CLAIM_ATTEMPT'),
        eq(ingestAuditLogs.type, 'ARTIST_DATA_REFRESH'),
        eq(ingestAuditLogs.type, 'ARTIST_DATA_REFRESH_FAILED')
      )
    )
    .orderBy(desc(ingestAuditLogs.createdAt))
    .limit(limit);

  return rows;
}
