import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

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

  const { userId: clerkUserId } = await auth();
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

  // Check if a DB row exists with this email but a different clerk_id
  const [existing] = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      {
        success: true,
        message: 'No existing DB user — will be created on next load',
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  if (existing.clerkId === clerkUserId) {
    return NextResponse.json(
      { success: true, message: 'Clerk ID already matches', synced: false },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  // Update the DB row to use the current Clerk user ID
  await db
    .update(users)
    .set({ clerkId: clerkUserId, updatedAt: new Date() })
    .where(eq(users.email, email));

  return NextResponse.json(
    {
      success: true,
      message: `Synced clerk_id for ${email}`,
      synced: true,
      oldClerkId: existing.clerkId,
      newClerkId: clerkUserId,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
