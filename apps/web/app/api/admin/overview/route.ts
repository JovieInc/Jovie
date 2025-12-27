import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, waitlistEntries } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { NO_STORE_HEADERS } from '@/lib/api/constants';

export const runtime = 'nodejs';


interface AdminOverviewResponse {
  mrrUsd: number;
  waitlistCount: number;
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
    const waitlistCount = await getWaitlistCount();

    const body: AdminOverviewResponse = {
      mrrUsd: mrrData.mrrUsd,
      waitlistCount,
    };

    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error in admin overview API:', error);
    return NextResponse.json(
      { error: 'Failed to load admin overview' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function getStripeMrr(): Promise<{
  mrrUsd: number;
  activeSubscribers: number;
}> {
  try {
    const { getAdminStripeOverviewMetrics } = await import(
      '@/lib/admin/stripe-metrics'
    );
    return await getAdminStripeOverviewMetrics();
  } catch (error) {
    console.error('Error computing Stripe MRR for admin overview:', error);
    return { mrrUsd: 0, activeSubscribers: 0 };
  }
}

async function getWaitlistCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(waitlistEntries);
    return Number(row?.count ?? 0);
  } catch (error) {
    console.error('Error computing waitlist count for admin overview:', error);
    return 0;
  }
}
