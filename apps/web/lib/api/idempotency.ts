/**
 * Idempotency key handling for API routes.
 * Prevents duplicate operations by caching responses for idempotent requests.
 */

import { and, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { dashboardIdempotencyKeys } from '@/lib/db/schema';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

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
        headers: NO_STORE_HEADERS,
      }) as NextResponse,
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
  responseBody: Record<string, unknown>,
  ttlMs: number
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
        expiresAt: new Date(Date.now() + ttlMs),
      })
      .onConflictDoNothing();
  } catch {
    // Non-critical: idempotency key storage failure shouldn't fail the request
    console.error('Failed to store idempotency key');
  }
}
