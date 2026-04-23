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
  const isProductionEnv =
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production';

  if (isProductionEnv) {
    return NextResponse.json(
      { success: false, error: 'Not available in production' },
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
