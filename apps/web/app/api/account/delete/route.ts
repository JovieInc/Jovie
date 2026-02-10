import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { setupDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
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
 */
export async function POST(request: Request) {
  const { userId: clerkUserId } = await auth();
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
    await setupDbSession(clerkUserId);

    const [user] = await db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (user.deletedAt) {
      return NextResponse.json(
        { error: 'Account is already deleted' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();

    // Soft-delete: anonymize all personal data and mark as deleted
    // GDPR requires removal of all PII - we retain only structural fields
    await db
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

    // Delete creator profiles (cascades to links, contacts, analytics)
    await db.delete(creatorProfiles).where(eq(creatorProfiles.userId, user.id));

    // Delete the Clerk user (signs out all sessions)
    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(clerkUserId);
    } catch (error_) {
      // Log but don't fail - the DB deletion is the critical part
      await captureError(
        'Failed to delete Clerk user during account deletion',
        error_,
        { route: '/api/account/delete', clerkUserId }
      );
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
