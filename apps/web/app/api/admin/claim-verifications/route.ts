import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CLAIM_VERIFICATION_STATUSES } from '@/lib/claim/claim-verification';
import { listClaimVerifications } from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const querySchema = z.object({
  status: z.enum(CLAIM_VERIFICATION_STATUSES).default('pending_verification'),
});

/**
 * GET /api/admin/claim-verifications?status=pending_verification
 *
 * Admin list of held high-reach artist claims (lib/claim/claim-verification.ts).
 */
export async function GET(request: NextRequest) {
  const entitlements = await getOvieOperatorEntitlements({ purpose: 'read' });
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

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const items = await listClaimVerifications(parsed.data.status);
    return NextResponse.json(
      { status: parsed.data.status, items },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to list claim verifications', error, {
      route: '/api/admin/claim-verifications',
    });
    return NextResponse.json(
      { error: 'Failed to list claim verifications' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
