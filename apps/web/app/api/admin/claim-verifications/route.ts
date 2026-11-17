import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { CLAIM_VERIFICATION_STATUSES } from '@/lib/claim/claim-verification';
import { listClaimVerifications } from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const querySchema = z.object({
  status: z.enum(CLAIM_VERIFICATION_STATUSES).default('pending_verification'),
});

/** Admin: held claim verifications (lib/claim/claim-verification-review.server.ts). */
async function getHandler({ request }: OperatorRouteInput) {
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

export const GET = defineRoute(
  {
    route: '/api/admin/claim-verifications',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  getHandler
);
