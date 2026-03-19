import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { campaignSettings } from '@/lib/db/schema/admin';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/admin/outreach/settings — Get current campaign settings.
 */
export async function GET() {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const [settings] = await db
    .select({ campaignsEnabled: campaignSettings.campaignsEnabled })
    .from(campaignSettings)
    .where(eq(campaignSettings.id, 1))
    .limit(1);

  return NextResponse.json(
    { campaignsEnabled: settings?.campaignsEnabled ?? true },
    { headers: NO_STORE_HEADERS }
  );
}
