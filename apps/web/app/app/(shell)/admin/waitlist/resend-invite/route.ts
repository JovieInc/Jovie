import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import { enqueueWaitlistApprovalInviteEmail } from '@/lib/waitlist/email-jobs';
import { isWaitlistInviteRedeemableStatus } from '@/lib/waitlist/state-machine';

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

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: `POST ${APP_ROUTES.ADMIN_WAITLIST}/resend-invite`,
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
      async tx => {
        const [entry] = await tx
          .select({ id: waitlistEntries.id, status: waitlistEntries.status })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, parsed.data.entryId))
          .for('update')
          .limit(1);

        if (!entry) {
          return { outcome: 'not_found' as const };
        }

        if (!isWaitlistInviteRedeemableStatus(entry.status)) {
          return {
            outcome: 'not_invitable' as const,
            status: entry.status,
          };
        }

        const now = new Date();
        await enqueueWaitlistApprovalInviteEmail(tx, entry.id, {
          force: true,
          dedupScope: `resend:${now.getTime()}`,
          now,
        });

        await insertWaitlistAuditLog(tx, {
          waitlistEntryId: entry.id,
          fromStatus: entry.status,
          toStatus: entry.status,
          actorUserId: entitlements?.userId ?? null,
          actorType: 'admin',
          reason: 'approval_invite_resent',
        });

        return { outcome: 'queued' as const, status: entry.status };
      },
      { isolationLevel: 'serializable' }
    );

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (result.outcome === 'not_invitable') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot resend invite for status: ${result.status}`,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: result.status,
        message: 'Invite email queued.',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: resend waitlist invite',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: `${APP_ROUTES.ADMIN_WAITLIST}/resend-invite`,
        action: 'resend_waitlist_invite',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to resend invite' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
