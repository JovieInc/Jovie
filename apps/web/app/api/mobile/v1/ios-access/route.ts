import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { env } from '@/lib/env-server';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { resolveIOSAlphaAccess } from '@/lib/mobile/ios-alpha-access';

export const runtime = 'nodejs';

export async function GET() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { hasAccess: false, installUrl: null },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const flagEnabled = await getAppFlagValue('IOS_APP_ALPHA_ACCESS', {
    userId: entitlements.userId,
  });

  return NextResponse.json(
    resolveIOSAlphaAccess({
      isAuthenticated: entitlements.isAuthenticated,
      isAdmin: entitlements.isAdmin,
      flagEnabled,
      installUrl: env.IOS_TESTFLIGHT_PUBLIC_LINK,
    }),
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
