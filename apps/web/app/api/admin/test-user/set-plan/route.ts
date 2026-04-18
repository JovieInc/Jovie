/**
 * POST /api/admin/test-user/set-plan
 *
 * Admin-only compatibility endpoint. For E2E flows, use
 * `/api/dev/test-user/set-plan` instead.
 */

import { NextResponse } from 'next/server';

import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export async function POST() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(
    {
      error:
        'Deprecated endpoint. Use /api/dev/test-user/set-plan for authenticated test-user plan changes.',
    },
    { status: 410 }
  );
}
