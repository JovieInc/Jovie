import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { syncClerkIdForEmail } from '@/lib/auth/sync-clerk-id';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Syncs the current Clerk user's ID to the DB row matching their email.
 *
 * Fixes the common local dev issue where the DB has a production Clerk ID
 * but the dev Clerk instance assigns a different user ID for the same email.
 */
export async function POST() {
  // SECURITY: dev-only routes use ALLOW gate, not DENY gate. See audit #1.
  // An AND-gate on (NODE_ENV && VERCEL_ENV === 'production') leaves preview/staging
  // open because VERCEL_ENV === 'preview' there. The correct pattern is to allow
  // only when the env is explicitly 'development'; every other env (preview,
  // staging, production) returns 403.
  const isDevEnv =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development';

  if (!isDevEnv) {
    return NextResponse.json(
      { success: false, error: 'Not available outside development' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) {
    return NextResponse.json(
      { success: false, error: 'No email on Clerk user' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  const outcome = await syncClerkIdForEmail(email, clerkUserId);

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

  return NextResponse.json(
    {
      success: true,
      message: `Synced clerk_id for ${email}`,
      synced: true,
      oldClerkId: outcome.oldClerkId,
      newClerkId: outcome.newClerkId,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
