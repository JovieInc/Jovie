import { and, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dashboardIdempotencyKeys } from '@/lib/db/schema';

/**
 * Idempotency key expiration time (24 hours).
 * This duration balances between:
 * - Long enough to catch retries from network failures and user refreshes
 * - Short enough to not consume excessive storage
 *
 * NOTE: Expired keys should be cleaned up periodically via a background job
 * or Postgres TTL extension (pg_cron). See dashboard_idempotency_keys table.
 */
const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Check for existing idempotency key and return cached response if found.
 */
export async function checkIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string
): Promise<{ cached: boolean; response?: NextResponse }> {
  if (!key) {
    return { cached: false };
  }

  const [existing] = await db
    .select({
      responseStatus: dashboardIdempotencyKeys.responseStatus,
      responseBody: dashboardIdempotencyKeys.responseBody,
      expiresAt: dashboardIdempotencyKeys.expiresAt,
    })
    .from(dashboardIdempotencyKeys)
    .where(
      and(
        eq(dashboardIdempotencyKeys.key, key),
        eq(dashboardIdempotencyKeys.userId, userId),
        eq(dashboardIdempotencyKeys.endpoint, endpoint),
        gt(dashboardIdempotencyKeys.expiresAt, new Date())
      )
    )
    .limit(1);

  if (existing) {
    return {
      cached: true,
      response: NextResponse.json(existing.responseBody ?? { ok: true }, {
        status: existing.responseStatus,
        headers: { 'Cache-Control': 'no-store' },
      }),
    };
  }

  return { cached: false };
}

/**
 * Store idempotency key with response for future deduplication.
 */
export async function storeIdempotencyKey(
  key: string,
  userId: string,
  endpoint: string,
  responseStatus: number,
  responseBody: Record<string, unknown>
): Promise<void> {
  if (!key) return;

  try {
    await db
      .insert(dashboardIdempotencyKeys)
      .values({
        key,
        userId,
        endpoint,
        responseStatus,
        responseBody,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
      })
      .onConflictDoNothing();
  } catch {
    // Non-critical: idempotency key storage failure shouldn't fail the request
    console.error('Failed to store idempotency key');
  }
}
