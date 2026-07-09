import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { preSaveTokens } from '@/lib/db/schema/pre-save';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { invalidateHandleCache } from '@/lib/onboarding/handle-availability-cache';
import {
  checkAccountDeleteRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

interface DeleteAccountBody {
  confirmation: string;
}

/**
 * POST /api/account/delete
 *
 * GDPR Article 17 - Right to erasure (right to be forgotten).
 * Allows users to delete their own account and all associated data.
 *
 * Requires confirmation text "DELETE" in the request body.
 *
 * Deletion is idempotent: a prior partial failure can be retried safely.
 * Dependent rows are removed first; `users.deletedAt` is written last as a
 * success-fence so a mid-chain error never leaves a banned limbo account.
 *
 * RLS contract: existence checks run in `withDbSession` (read-only). The
 * destructive delete chain runs inside `withDbSessionTx` so `app.clerk_user_id`
 * is set on the same connection as every DELETE/UPDATE. All cross-table deletes
 * must filter by the resolved `user.id` — never rely on RLS alone.
 */
export async function POST(request: Request) {
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  // Rate limiting - prevent abuse of destructive endpoint
  const rateLimitResult = await checkAccountDeleteRateLimit(clerkUserId);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.reason ?? 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  const parsed = await parseJsonBody<DeleteAccountBody>(request, {
    route: 'POST /api/account/delete',
    headers: NO_STORE_HEADERS,
  });

  if (!parsed.ok) return parsed.response;

  const { confirmation } = parsed.data;

  if (confirmation !== 'DELETE') {
    return NextResponse.json(
      { error: 'Please type DELETE to confirm account deletion' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const user = await withDbSession(
      async sessionClerkUserId => {
        const [row] = await db
          .select({ id: users.id, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, sessionClerkUserId))
          .limit(1);

        return row;
      },
      { clerkUserId }
    );

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();

    const profiles = await withDbSessionTx(
      async tx => {
        const profileRows = await tx
          .select({ usernameNormalized: creatorProfiles.usernameNormalized })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, user.id));

        // Delete dependent data first — users.deletedAt is the success-fence below
        await tx
          .delete(creatorProfiles)
          .where(eq(creatorProfiles.userId, user.id));
        await tx.delete(preSaveTokens).where(eq(preSaveTokens.userId, user.id));
        await tx.delete(feedbackItems).where(eq(feedbackItems.userId, user.id));
        await tx
          .delete(emailSuppressions)
          .where(eq(emailSuppressions.createdBy, user.id));

        if (!user.deletedAt) {
          // Soft-delete: anonymize all personal data and mark as deleted
          // GDPR requires removal of all PII - we retain only structural fields
          await tx
            .update(users)
            .set({
              name: null,
              email: null,
              stripeCustomerId: null,
              stripeSubscriptionId: null,
              waitlistEntryId: null,
              deletedAt: now,
              userStatus: 'banned',
              updatedAt: now,
            })
            .where(eq(users.id, user.id));
        }

        return profileRows;
      },
      { clerkUserId }
    );

    // Invalidate handle availability cache so deleted usernames become available
    for (const profile of profiles) {
      if (profile.usernameNormalized) {
        await invalidateHandleCache(profile.usernameNormalized);
        await invalidateProfileCache(profile.usernameNormalized);
      }
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    await captureError('Failed to delete user account', err, {
      route: '/api/account/delete',
    });
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
