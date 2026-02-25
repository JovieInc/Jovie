import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import {
  disapproveWaitlistEntryInTx,
  finalizeWaitlistDisapproval,
} from '@/lib/waitlist/approval';

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
      route: `POST ${APP_ROUTES.ADMIN_WAITLIST}/disapprove`,
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = waitlistApproveSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withSystemIngestionSession(
      async tx => disapproveWaitlistEntryInTx(tx, parsed.data.entryId),
      { isolationLevel: 'serializable' }
    );

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (result.outcome === 'already_new') {
      return NextResponse.json(
        {
          success: true,
          status: 'new',
          message: 'Entry is already unapproved',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    await finalizeWaitlistDisapproval(result);

    return NextResponse.json(
      {
        success: true,
        status: 'new',
        message: 'Waitlist approval revoked successfully.',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: disapprove waitlist entry',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: `${APP_ROUTES.ADMIN_WAITLIST}/disapprove`,
        action: 'disapprove_waitlist',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to disapprove waitlist entry' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
