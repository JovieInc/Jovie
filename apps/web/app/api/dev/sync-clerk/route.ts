import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { selectVerifiedClerkEmail } from '@/lib/auth/clerk-identity';
import { syncClerkIdForEmail } from '@/lib/auth/sync-clerk-id';
import {
  developmentOnlyForbiddenJson,
  isExplicitDevelopmentEnvironment,
} from '@/lib/security/development-only';
import { normalizeEmail } from '@/lib/utils/email';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Syncs the current Clerk user's ID to the DB row matching their email.
 *
 * Fixes the common local dev issue where the DB has a production Clerk ID
 * but the dev Clerk instance assigns a different user ID for the same email.
 */
export async function POST() {
  if (!isExplicitDevelopmentEnvironment()) {
    return developmentOnlyForbiddenJson(undefined, {
      headers: NO_STORE_HEADERS,
    });
  }

  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const clerkUser = await currentUser();
  const verifiedEmail = selectVerifiedClerkEmail(clerkUser?.emailAddresses);
  if (!verifiedEmail) {
    return NextResponse.json(
      { success: false, error: 'Email not verified' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  const outcome = await syncClerkIdForEmail(
    normalizeEmail(verifiedEmail),
    clerkUserId
  );

  if (outcome.kind === 'no_db_row') {
    return NextResponse.json(
      {
        success: true,
        message: 'No existing DB user — will be created on next load',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  if (outcome.kind === 'in_sync') {
    return NextResponse.json(
      { success: true, message: 'Clerk ID already matches', synced: false },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  if (outcome.kind === 'ambiguous_email') {
    return NextResponse.json(
      {
        success: false,
        error: `Multiple DB users share email (${outcome.matchCount} rows)`,
        code: 'ambiguous_email',
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  if (outcome.kind === 'clerk_id_taken') {
    return NextResponse.json(
      {
        success: false,
        error: 'Session clerk_id is already bound to a different user row',
        code: 'clerk_id_taken',
        existingUserId: outcome.existingUserId,
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: `Synced clerk_id for ${verifiedEmail}`,
      synced: true,
      oldClerkId: outcome.oldClerkId,
      newClerkId: outcome.newClerkId,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
