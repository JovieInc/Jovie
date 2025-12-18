import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';

import { isAdminEmail } from '@/lib/admin/roles';
import { db, waitlistEntries } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

interface AdminOverviewResponse {
  mrrUsd: number;
  waitlistCount: number;
}

export async function GET() {
  try {
    const entitlements = await getCurrentUserEntitlements();

    if (!entitlements.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(entitlements.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mrrData = await getStripeMrr();
    const waitlistCount = await getWaitlistCount();

    const body: AdminOverviewResponse = {
      mrrUsd: mrrData.mrrUsd,
      waitlistCount,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error('Error in admin overview API:', error);
    return NextResponse.json(
      { error: 'Failed to load admin overview' },
      { status: 500 }
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
