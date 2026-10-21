import { NextResponse } from 'next/server';
import { z } from 'zod';
import { claimDecisionResponse } from '@/lib/claim/claim-verification-http';
import { decideClaimVerification } from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

const ROUTE = '/api/admin/claim-verifications/[profileId]/decision';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Admin: held claim verifications (lib/claim/claim-verification-review.server.ts). */
export async function POST(
  request: Request,
  context: { params: Promise<{ profileId: string }> }
): Promise<NextResponse> {
  const entitlements = await getOvieOperatorEntitlements();
  if (!entitlements.isAuthenticated)
    return json({ error: 'Unauthorized' }, 401);
  if (!entitlements.isAdmin) return json({ error: 'Forbidden' }, 403);

  const { profileId } = await context.params;
  if (!UUID_PATTERN.test(profileId)) return json({ error: 'not_found' }, 404);

  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
    maxBodySize: 8 * 1024,
  });
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return json({ error: 'invalid_decision' }, 422);

  try {
    const result = await decideClaimVerification({
      profileId,
      decision: parsed.data.decision,
      reason: parsed.data.reason ?? null,
      decidedBy: entitlements.email ?? entitlements.userId ?? null,
    });
    return claimDecisionResponse(result);
  } catch (error) {
    await captureError('Claim verification decision failed', error, {
      route: ROUTE,
    });
    return json({ error: 'decision_failed' }, 500);
  }
}
