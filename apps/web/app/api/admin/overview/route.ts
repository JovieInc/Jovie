import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getRedis } from '@/lib/redis';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface AdminOverviewResponse {
  mrrUsd: number;
  waitlistCount: number;
  errors?: {
    mrr?: string;
    waitlist?: string;
  };
}

export async function GET() {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const mrrData = await getStripeMrr();
    const waitlistData = await getWaitlistCount();

    const body: AdminOverviewResponse = {
      mrrUsd: mrrData.mrrUsd,
      waitlistCount: waitlistData.count,
    };

    // Add error flags if any data fetch failed
    const errors: AdminOverviewResponse['errors'] = {};
    if (mrrData.error) errors.mrr = mrrData.error;
    if (waitlistData.error) errors.waitlist = waitlistData.error;
    if (Object.keys(errors).length > 0) {
      body.errors = errors;
    }

    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Error in admin overview API:', error);
    await captureError('Admin overview fetch failed', error, { route: '/api/admin/overview', method: 'GET' });
    return NextResponse.json(
      { error: 'Failed to load admin overview' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function getStripeMrr(): Promise<{
  mrrUsd: number;
  activeSubscribers: number;
  error?: string;
}> {
  const CACHE_KEY = 'admin:stripe:mrr';
  const CACHE_TTL = 300; // 5 minutes
  const redis = getRedis();

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached as string);
      }
    } catch (cacheError) {
      // Log but don't fail - fall through to fresh fetch
      logger.warn('Redis cache read failed for Stripe MRR', {
        error: cacheError,
      });
    }
  }

  // Fetch fresh data
  try {
    const { getAdminStripeOverviewMetrics } = await import(
      '@/lib/admin/stripe-metrics'
    );
    const metrics = await getAdminStripeOverviewMetrics();

    const result = {
      mrrUsd: metrics.mrrUsd,
      activeSubscribers: metrics.activeSubscribers,
      error: metrics.errorMessage,
    };

    // Cache the result (fire-and-forget)
    if (redis && !result.error) {
      redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result)).catch(err => {
        logger.warn('Redis cache write failed for Stripe MRR', { error: err });
      });
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error fetching MRR';
    logger.error('Error computing Stripe MRR for admin overview:', error);
    return { mrrUsd: 0, activeSubscribers: 0, error: message };
  }
}

async function getWaitlistCount(): Promise<{
  count: number;
  error?: string;
}> {
  try {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(waitlistEntries);
    return { count: Number(row?.count ?? 0) };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error fetching waitlist count';
    logger.error('Error computing waitlist count for admin overview:', error);
    return { count: 0, error: message };
  }
}
