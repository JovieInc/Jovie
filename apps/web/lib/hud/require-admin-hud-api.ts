import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function requireAdminHudApiAccess(options?: {
  session?: 'cookie' | 'fresh';
}): Promise<NextResponse | null> {
  const entitlements = await getCurrentUserEntitlements(options);
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
  return null;
}
