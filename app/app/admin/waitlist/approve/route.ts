import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, waitlistEntries } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { sendNotification } from '@/lib/notifications/service';
import { buildWaitlistInviteEmail } from '@/lib/waitlist/invite';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const approveSchema = z.object({
  entryId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const entitlements = await getCurrentUserEntitlements();
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

    const body = await request.json().catch(() => null);
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [entry] = await db
      .select({
        id: waitlistEntries.id,
        email: waitlistEntries.email,
        fullName: waitlistEntries.fullName,
        status: waitlistEntries.status,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, parsed.data.entryId))
      .limit(1);

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (entry.status === 'invited' || entry.status === 'claimed') {
      return NextResponse.json(
        { success: true, status: entry.status },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    await db
      .update(waitlistEntries)
      .set({ status: 'invited', updatedAt: new Date() })
      .where(eq(waitlistEntries.id, entry.id));

    const { message, target } = buildWaitlistInviteEmail({
      email: entry.email,
      fullName: entry.fullName,
      dedupKey: `waitlist_invite:${entry.id}`,
    });

    const emailResult = await sendNotification(message, target);

    const hadEmailErrors = emailResult.errors.length > 0;

    return NextResponse.json(
      {
        success: !hadEmailErrors,
        status: 'invited',
        notification: {
          delivered: emailResult.delivered,
          errors: emailResult.errors,
          skipped: emailResult.skipped,
        },
      },
      { status: hadEmailErrors ? 500 : 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Admin waitlist approve error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to approve waitlist entry' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
