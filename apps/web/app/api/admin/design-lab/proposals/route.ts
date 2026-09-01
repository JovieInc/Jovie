import 'server-only';

import { NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

async function canUseTasteInbox(
  entitlements: Awaited<ReturnType<typeof getCurrentUserEntitlements>>
): Promise<boolean> {
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return false;
  }

  return entitlements.isAdmin || (await checkAdminRole(entitlements.userId));
}

export async function GET(): Promise<Response> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        {
          error: 'Sign in to Ovie to load the Taste Inbox.',
          code: 'ovie_taste_inbox_unauthorized',
          action: 'sign_in',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!(await canUseTasteInbox(entitlements))) {
      return NextResponse.json(
        {
          error: 'Use an admin Ovie account to load the Taste Inbox.',
          code: 'ovie_taste_inbox_forbidden',
          action: 'use_admin_account',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const proposals = await listPendingDesignProposals();

    return NextResponse.json(
      {
        proposals,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error(
      '[api/admin/design-lab/proposals] Failed to list proposals',
      error
    );
    await captureError('Design Lab proposals fetch failed', error, {
      route: '/api/admin/design-lab/proposals',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch design proposals' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
