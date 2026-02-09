/**
 * Billing History API
 * Returns the current user's billing audit log entries
 */

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { getBillingAuditLog } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Get the internal user ID from billing info
    const billingResult = await getUserBillingInfo();
    if (!billingResult.success || !billingResult.data) {
      return NextResponse.json(
        { entries: [] },
        { headers: CACHE_HEADERS }
      );
    }

    const { userId } = billingResult.data;
    const auditResult = await getBillingAuditLog(userId, 50);

    if (!auditResult.success || !auditResult.data) {
      return NextResponse.json(
        { entries: [] },
        { headers: CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { entries: auditResult.data },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting billing history:', error);

    Sentry.captureException(error, {
      level: 'error',
      tags: {
        route: '/api/billing/history',
        errorType: 'billing_error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to get billing history' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
