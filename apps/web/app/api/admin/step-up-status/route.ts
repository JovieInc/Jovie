import { NextResponse } from 'next/server';
import { hasRecentAdminMfaReverification } from '@/lib/admin/mfa';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';

export const runtime = 'nodejs';

/**
 * Whether the current session carries a live admin passkey step-up
 * (JOV-6892). The unlock flow calls this right after `signIn.passkey` so a
 * device-only passkey — which signs in but writes no receipt — fails loudly
 * instead of looping back to the lock screen.
 */
export async function GET() {
  const auth = await getCachedAuth({ session: 'fresh' });
  const unlocked = Boolean(
    auth.userId &&
      (await checkAdminRole(auth.userId)) &&
      (await hasRecentAdminMfaReverification(auth))
  );
  return NextResponse.json(
    { unlocked },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
