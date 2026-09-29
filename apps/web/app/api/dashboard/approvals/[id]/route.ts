import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  decideProfileApproval,
  revokeProfileApproval,
} from '@/lib/team/approvals';

export const runtime = 'nodejs';

const decisionBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(1000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/dashboard/approvals/[id]
 * Owner decision on a pending approval (server-enforced owner check).
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    return await withDbSessionTx(async (tx, appUserId) => {
      const { id } = await context.params;
      const parsedBody = await parseJsonBody<unknown>(req, {
        route: 'POST /api/dashboard/approvals/[id]',
        headers: NO_STORE_HEADERS,
      });
      if (!parsedBody.ok) return parsedBody.response;
      const parsed = decisionBodySchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body', code: 'invalid_body' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const result = await decideProfileApproval(tx, {
        approvalId: id,
        actorUserId: appUserId,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
      });
      if (!result.ok) {
        const status =
          result.reason === 'forbidden'
            ? 403
            : result.reason === 'not_found'
              ? 404
              : result.reason === 'not_pending'
                ? 409
                : 400;
        return NextResponse.json(
          { error: 'Decision rejected', code: result.reason },
          { status, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { ok: true, status: parsed.data.decision },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    return handleError(error, 'POST /api/dashboard/approvals/[id]');
  }
}

/**
 * DELETE /api/dashboard/approvals/[id]
 * Revoke an approval — requester may withdraw their own request; owner may
 * revoke any pending or approved grant.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    return await withDbSessionTx(async (tx, appUserId) => {
      const { id } = await context.params;
      const result = await revokeProfileApproval(tx, {
        approvalId: id,
        actorUserId: appUserId,
      });
      if (!result.ok) {
        const status =
          result.reason === 'forbidden'
            ? 403
            : result.reason === 'not_found'
              ? 404
              : result.reason === 'not_pending'
                ? 409
                : 400;
        return NextResponse.json(
          { error: 'Revocation rejected', code: result.reason },
          { status, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { ok: true, status: 'revoked' },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    return handleError(error, 'DELETE /api/dashboard/approvals/[id]');
  }
}

function handleError(error: unknown, route: string) {
  captureError('Approvals API error', error, { route });
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
