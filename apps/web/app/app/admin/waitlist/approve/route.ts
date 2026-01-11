import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles, users, waitlistEntries } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { sendNotification } from '@/lib/notifications/service';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
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
      route: 'POST /app/admin/waitlist/approve',
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
        const now = new Date();

        // Lock waitlist entry for update
        const [entry] = await tx
          .select({
            id: waitlistEntries.id,
            email: waitlistEntries.email,
            fullName: waitlistEntries.fullName,
            primarySocialUrlNormalized:
              waitlistEntries.primarySocialUrlNormalized,
            status: waitlistEntries.status,
          })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, parsed.data.entryId))
          .for('update')
          .limit(1);

        if (!entry) {
          return { outcome: 'not_found' as const };
        }

        if (entry.status !== 'new') {
          return {
            outcome: 'already_processed' as const,
            status: entry.status,
          };
        }

        // Get profile created during signup (via waitlistEntryId)
        const [profile] = await tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.waitlistEntryId, entry.id))
          .limit(1);

        if (!profile) {
          throw new Error(
            'Profile not found for waitlist entry. User must submit waitlist form to auto-create profile.'
          );
        }

        // Get user by email
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(drizzleSql`lower(${users.email}) = lower(${entry.email})`)
          .limit(1);

        if (!user) {
          throw new Error(
            'User not found for email. User may need to sign in first to create auth record.'
          );
        }

        // Link profile to user and mark as claimed + public
        await tx
          .update(creatorProfiles)
          .set({
            userId: user.id,
            isClaimed: true,
            isPublic: true,
            onboardingCompletedAt: now, // Skip onboarding
            updatedAt: now,
          })
          .where(eq(creatorProfiles.id, profile.id));

        // Update waitlist entry status to 'claimed' (skip 'invited' state)
        await tx
          .update(waitlistEntries)
          .set({
            status: 'claimed',
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));

        // Update user status to 'active'
        await tx
          .update(users)
          .set({
            userStatus: 'active',
            updatedAt: now,
          })
          .where(eq(users.id, user.id));

        return {
          outcome: 'approved' as const,
          profileId: profile.id,
          email: entry.email,
          fullName: entry.fullName,
        };
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
          success: false,
          error: `Entry already processed with status: ${result.status}`,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

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
        route: '/app/admin/waitlist/approve',
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
