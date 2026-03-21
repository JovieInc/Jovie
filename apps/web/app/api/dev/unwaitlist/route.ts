import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getWaitlistAccess } from '@/lib/auth/gate';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
} from '@/lib/waitlist/approval';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
  // Only allow in non-production environments (same guard as DevToolbar)
  const isProductionEnv =
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production';

  if (isProductionEnv) {
    return NextResponse.json(
      { success: false, error: 'Not available in production' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.email) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const waitlistAccess = await getWaitlistAccess(entitlements.email);
  if (!waitlistAccess.entryId) {
    return NextResponse.json(
      { success: false, error: 'No waitlist entry found for this email' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const result = await withSystemIngestionSession(
    async tx => approveWaitlistEntryInTx(tx, waitlistAccess.entryId!),
    { isolationLevel: 'serializable' }
  );

  if (result.outcome === 'already_processed') {
    // Still invalidate cache — previous approval may have cached stale state
    const { userId } = await auth();
    if (userId) {
      await invalidateProxyUserStateCache(userId);
    }
    return NextResponse.json(
      { success: true, message: 'Already approved', status: result.status },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  if (result.outcome !== 'approved') {
    return NextResponse.json(
      { success: false, error: `Unexpected outcome: ${result.outcome}` },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  await finalizeWaitlistApproval(result);

  return NextResponse.json(
    {
      success: true,
      message: 'Waitlist entry approved — reload to access the dashboard',
      profileId: result.profileId,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
