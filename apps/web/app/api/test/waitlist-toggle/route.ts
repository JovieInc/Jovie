import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Matches the waitlistStatusEnum: 'new' | 'invited' | 'claimed'
// 'clear' is a special action to delete the entry
type WaitlistState = 'clear' | 'new' | 'claimed';

/**
 * Test-only API endpoint to toggle waitlist state for E2E tests.
 * This endpoint is only available when NODE_ENV === 'test'.
 *
 * POST /api/test/waitlist-toggle?state=clear|new|claimed
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state') as WaitlistState | null;

  if (state !== 'clear' && state !== 'new' && state !== 'claimed') {
    return NextResponse.json(
      { ok: false, error: 'Invalid state' },
      { status: 400 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const clerkUser = await currentUser();
  const emailRaw = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!emailRaw) {
    return NextResponse.json(
      { ok: false, error: 'No email on user' },
      { status: 400 }
    );
  }

  const email = emailRaw.trim().toLowerCase();
  const fullName = clerkUser?.fullName ?? 'Test User';

  if (state === 'clear') {
    await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email));
    return NextResponse.json({ success: true, state, email });
  }

  const [existing] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(waitlistEntries)
      .set({ status: state, updatedAt: new Date() })
      .where(eq(waitlistEntries.id, existing.id));
  } else {
    await db.insert(waitlistEntries).values({
      fullName,
      email,
      primarySocialUrl: 'https://instagram.com/jovie',
      primarySocialPlatform: 'instagram',
      primarySocialUrlNormalized: 'https://instagram.com/jovie',
      status: state,
    });
  }

  return NextResponse.json({ success: true, state, email });
}
