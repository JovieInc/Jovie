import { NextResponse } from 'next/server';
import { devUnwaitlistSessionUser } from '@/lib/dev/dev-unwaitlist.server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  developmentOnlyForbiddenJson,
  isExplicitDevelopmentEnvironment,
  isVercelProductionDeployment,
} from '@/lib/security/development-only';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
  if (isVercelProductionDeployment() || !isExplicitDevelopmentEnvironment()) {
    return developmentOnlyForbiddenJson(undefined, {
      headers: NO_STORE_HEADERS,
    });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (
    !entitlements.isAuthenticated ||
    !entitlements.email ||
    !entitlements.userId
  ) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const result = await devUnwaitlistSessionUser({
    userId: entitlements.userId,
    email: entitlements.email,
    clerkId: null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: result.message,
      profileId: result.profileId,
      waitlistStatus: result.waitlistStatus,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
