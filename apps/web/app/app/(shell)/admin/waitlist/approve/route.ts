import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { sendNotification } from '@/lib/notifications/service';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import {
  approveWaitlistEntryInTx,
  finalizeWaitlistApproval,
} from '@/lib/waitlist/approval';
import { buildWaitlistInviteEmail } from '@/lib/waitlist/invite';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  let entitlements;
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
      async tx => approveWaitlistEntryInTx(tx, parsed.data.entryId),
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
          success: false,
          error: `Entry already processed with status: ${result.status}`,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    await finalizeWaitlistApproval(result);

    // Send welcome email after successful approval
    const { message, target } = buildWaitlistInviteEmail({
      email: result.email,
      fullName: result.fullName,
      dedupKey: `waitlist_welcome:${result.profileId}`,
    });

    // Fire-and-forget: don't block the response on email delivery
    sendNotification(message, target).catch(error => {
      captureCriticalError(
        'Failed to send waitlist welcome email',
        error instanceof Error ? error : new Error(String(error)),
        {
          profileId: result.profileId,
          email: result.email,
        }
      );
    });

    return NextResponse.json(
      {
        success: true,
        status: 'claimed',
        profileId: result.profileId,
        message:
          'Profile linked to user and activated. User can sign in immediately.',
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
