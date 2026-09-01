import { del } from '@vercel/blob';
import { and, eq, inArray } from 'drizzle-orm';
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
import {
  FOUNDER_REVIEW_SOURCE,
  FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
  StoredFounderReviewContextSchema,
  StoredFounderReviewUploadLeaseSchema,
} from '@/lib/founder-review/contract';
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

function founderReviewBlobUrls(rows: ReadonlyArray<{ context: unknown }>) {
  return Array.from(
    new Set(
      rows.flatMap(row => {
        const review = StoredFounderReviewContextSchema.safeParse(row.context);
        if (review.success && review.data.recording.media) {
          return [review.data.recording.media.blobUrl];
        }
        const lease = StoredFounderReviewUploadLeaseSchema.safeParse(
          row.context
        );
        return lease.success ? [lease.data.blob.url] : [];
      })
    )
  );
}

async function deleteFounderReviewBlobs(
  rows: ReadonlyArray<{ context: unknown }>
) {
  const urls = founderReviewBlobUrls(rows);
  if (urls.length > 0) await del(urls);
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
 * `users.deletedAt` is written first as an erasure fence so a pre-issued
 * private-upload callback cannot create new retained data during deletion.
 * The remaining steps are retry-safe when a partial failure follows the fence.
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
    const lookup = await withDbSession(
      async sessionClerkUserId => {
        const [row] = await db
          .select({ id: users.id, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, sessionClerkUserId))
          .limit(1);
        return row ?? null;
      },
      { clerkUserId }
    );
    const user = lookup;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();

    if (!user.deletedAt) {
      await withDbSessionTx(
        async tx => {
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
        },
        { clerkUserId }
      );
    }

    const founderReviewRows = await db
      .select({ context: feedbackItems.context })
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.userId, user.id),
          inArray(feedbackItems.source, [
            FOUNDER_REVIEW_SOURCE,
            FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
          ])
        )
      );

    await deleteFounderReviewBlobs(founderReviewRows);

    const profiles = await withDbSessionTx(
      async tx => {
        const profileRows = await tx
          .select({ usernameNormalized: creatorProfiles.usernameNormalized })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, user.id));

        // The account is already fenced; these retry-safe deletes remove data.
        await tx
          .delete(creatorProfiles)
          .where(eq(creatorProfiles.userId, user.id));
        await tx.delete(preSaveTokens).where(eq(preSaveTokens.userId, user.id));
        await tx.delete(feedbackItems).where(eq(feedbackItems.userId, user.id));
        await tx
          .delete(emailSuppressions)
          .where(eq(emailSuppressions.createdBy, user.id));

        return profileRows;
      },
      { clerkUserId }
    );

    // Catch an upload whose token was issued before deletion and whose callback
    // raced the first snapshot. The callback also rechecks the active-user
    // fence after inserting, so uploads that land after this sweep self-delete.
    const lateFounderReviewRows = await db
      .select({ context: feedbackItems.context })
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.userId, user.id),
          inArray(feedbackItems.source, [
            FOUNDER_REVIEW_SOURCE,
            FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
          ])
        )
      );
    await deleteFounderReviewBlobs(lateFounderReviewRows);
    if (lateFounderReviewRows.length > 0) {
      await db
        .delete(feedbackItems)
        .where(
          and(
            eq(feedbackItems.userId, user.id),
            inArray(feedbackItems.source, [
              FOUNDER_REVIEW_SOURCE,
              FOUNDER_REVIEW_UPLOAD_LEASE_SOURCE,
            ])
          )
        );
    }

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
