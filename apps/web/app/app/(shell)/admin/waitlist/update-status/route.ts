import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { waitlistEntries } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const updateStatusSchema = z.object({
  entryId: z.string().uuid(),
  status: z.enum(['new', 'invited', 'claimed']),
});

export async function POST(request: Request) {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
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

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /app/admin/waitlist/update-status',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withSystemIngestionSession(
      async tx => {
        const now = new Date();

        // Lock waitlist entry for update
        const [entry] = await tx
          .select({
            id: waitlistEntries.id,
            status: waitlistEntries.status,
          })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, parsed.data.entryId))
          .for('update')
          .limit(1);

        if (!entry) {
          return { outcome: 'not_found' as const };
        }

        // Update waitlist entry status
        await tx
          .update(waitlistEntries)
          .set({
            status: parsed.data.status,
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));

        return {
          outcome: 'updated' as const,
          status: parsed.data.status,
        };
      },
      { isolationLevel: 'serializable' }
    );

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: result.status,
        message: `Status updated to ${result.status}`,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: update waitlist status',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/app/admin/waitlist/update-status',
        action: 'update_waitlist_status',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to update waitlist status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
