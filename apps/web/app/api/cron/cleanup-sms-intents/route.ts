import { and, sql as drizzleSql, lte } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { smsSubscribeIntents } from '@/lib/db/schema/notifications';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Daily janitor: mark expired SMS subscribe intents as `expired` and
 * hard-delete rows older than 24h.
 *
 * Append-only migration left no built-in TTL; this cron is the cleanup
 * (decision row #45 / codex ENG-N7).
 *
 * NOTE: The standalone Vercel schedule for this route has been removed per
 * JOV-1901 / AUTOMATION_AUDIT.md. The cleanup is now a sub-job of
 * `/api/cron/daily-maintenance`. This file remains as an admin escape hatch
 * (callable via `cleanupSmsIntents()` or the GET endpoint directly).
 */
export async function cleanupSmsIntents(): Promise<{
  expired: number;
  deleted: number;
}> {
  const now = new Date();
  const purgeBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Step 1: mark anything past expiresAt that is still "created" or
  // "sms_received" as "expired" so polling clients see a definite state.
  const expired = await db
    .update(smsSubscribeIntents)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        lte(smsSubscribeIntents.expiresAt, now),
        drizzleSql`${smsSubscribeIntents.status} IN ('created', 'sms_received')`
      )
    )
    .returning({ id: smsSubscribeIntents.id });

  // Step 2: delete rows older than the purge horizon. Confirmed rows are
  // also deleted — the per-artist subscription is the durable record.
  const deleted = await db
    .delete(smsSubscribeIntents)
    .where(lte(smsSubscribeIntents.createdAt, purgeBefore))
    .returning({ id: smsSubscribeIntents.id });

  logger.info('SMS intent cleanup complete', {
    expired: expired.length,
    deleted: deleted.length,
  });

  return { expired: expired.length, deleted: deleted.length };
}

export async function GET(request: NextRequest) {
  const failure = verifyCronRequest(request, {
    route: '/api/cron/cleanup-sms-intents',
  });
  if (failure) return failure;

  try {
    const result = await cleanupSmsIntents();

    return NextResponse.json(
      { success: true, ...result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('SMS intent cleanup failed', error, {});
    return NextResponse.json(
      { success: false, error: 'cleanup_failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
