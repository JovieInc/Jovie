import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  listProfileApprovals,
  requestProfileApproval,
} from '@/lib/team/approvals';
import { isRiskyProfileAction } from '@/lib/team/permissions';
import { approvalFailureStatus, handleApprovalsError } from './route.shared';

export const runtime = 'nodejs';

const requestBodySchema = z.object({
  profileId: z.string().uuid(),
  action: z.string(),
  reason: z.string().max(1000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/dashboard/approvals?profileId=<uuid>
 * List approval requests visible to the caller's team.
 */
export async function GET(req: Request) {
  try {
    return await withDbSessionTx(async (tx, appUserId) => {
      const profileId = new URL(req.url).searchParams.get('profileId');
      if (!profileId) {
        return NextResponse.json(
          { error: 'profileId is required', code: 'missing_params' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      const result = await listProfileApprovals(tx, { profileId, appUserId });
      if (!result.ok) {
        const status = result.reason === 'forbidden' ? 403 : 404;
        return NextResponse.json(
          { error: 'Forbidden', code: result.reason },
          { status, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { approvals: result.approvals },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    return handleApprovalsError(error, 'GET /api/dashboard/approvals');
  }
}

/**
 * POST /api/dashboard/approvals
 * Request owner approval for a risky action (manager/assistant roles).
 */
export async function POST(req: Request) {
  try {
    return await withDbSessionTx(async (tx, appUserId) => {
      const parsedBody = await parseJsonBody<unknown>(req, {
        route: 'POST /api/dashboard/approvals',
        headers: NO_STORE_HEADERS,
      });
      if (!parsedBody.ok) return parsedBody.response;

      const parsed = requestBodySchema.safeParse(parsedBody.data);
      if (!parsed.success || !isRiskyProfileAction(parsed.data?.action)) {
        return NextResponse.json(
          { error: 'Invalid request body', code: 'invalid_body' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const result = await requestProfileApproval(tx, {
        appUserId,
        profileId: parsed.data.profileId,
        action: parsed.data.action,
        reason: parsed.data.reason,
        payload: parsed.data.payload,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: 'Approval request rejected', code: result.reason },
          {
            status: approvalFailureStatus(result.reason),
            headers: NO_STORE_HEADERS,
          }
        );
      }
      return NextResponse.json(
        { approvalId: result.approvalId, status: 'pending' },
        {
          status: result.alreadyPending ? 200 : 201,
          headers: NO_STORE_HEADERS,
        }
      );
    });
  } catch (error) {
    return handleApprovalsError(error, 'POST /api/dashboard/approvals');
  }
}
