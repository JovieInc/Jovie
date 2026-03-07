import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/leads/[id]/dm-sent — Mark a DM as sent.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const { id } = await params;
    const now = new Date();

    const [updated] = await db
      .update(leads)
      .set({
        dmSentAt: now,
        outreachStatus: 'dm_sent',
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(updated, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const { id } = await params;
    await captureError('Failed to mark DM as sent', error, {
      route: '/api/admin/leads/[id]/dm-sent',
      contextData: { id },
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to mark DM as sent') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
