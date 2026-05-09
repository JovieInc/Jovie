import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
} from '@/lib/waitlist/approval';
import { enqueueWaitlistApprovalInviteEmail } from '@/lib/waitlist/email-jobs';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  let entitlements:
    | Awaited<ReturnType<typeof getCurrentUserEntitlements>>
    | undefined;
  try {
    entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    const adminUserId = entitlements.userId;

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: `POST ${APP_ROUTES.ADMIN_WAITLIST}/approve`,
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = waitlistApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withSystemIngestionSession(
      async tx => {
        const approval = await approveWaitlistEntryInTx(
          tx,
          parsed.data.entryId,
          {
            actorUserId: adminUserId,
            actorType: 'admin',
            reason: 'manual_approval',
            targetStatus: 'invited',
          }
        );
        if (approval.outcome === 'approved') {
          await enqueueWaitlistApprovalInviteEmail(tx, approval.entryId);
        }
        return approval;
      },
      { isolationLevel: 'serializable' }
    );

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (result.outcome === 'already_processed') {
      return NextResponse.json(
        {
          success: true,
          status: result.status,
          message: `Entry already processed with status: ${result.status}`,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (result.outcome === 'no_user') {
      return NextResponse.json(
        {
          success: false,
          error:
            'No auth record found for this email. The user must sign in at least once before being approved.',
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    await finalizeWaitlistApproval(result);

    return NextResponse.json(
      {
        success: true,
        status: 'invited',
        profileId: result.profileId,
        waitlistEntryId: result.entryId,
        message: 'Access approved. Invite email queued.',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: approve waitlist entry',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: `${APP_ROUTES.ADMIN_WAITLIST}/approve`,
        action: 'approve_waitlist',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to approve waitlist entry' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
