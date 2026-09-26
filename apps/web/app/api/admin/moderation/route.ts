import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyModerationTakedown,
  listAbuseReports,
} from '@/lib/admin/moderation';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { reportTargetTypes } from '@/lib/validation/schemas/report';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const takedownSchema = z.object({
  targetType: z.enum(reportTargetTypes),
  target: z.string().min(1).max(500),
  reportId: z.string().uuid().optional(),
  reason: z.string().max(2000).optional(),
});

async function requireAdmin() {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }
  if (!entitlements.isAdmin || !entitlements.userId) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { adminUserId: entitlements.userId };
}

/** GET /api/admin/moderation — pending abuse/security reports (JOV-6599). */
export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const limit = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get('limit')) || 50, 1),
    200
  );
  try {
    const reports = await listAbuseReports(limit);
    return NextResponse.json({ reports }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    captureError('Failed to list moderation reports', e);
    return NextResponse.json(
      { error: 'Failed to load reports' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/** POST /api/admin/moderation — authorized takedown of a reported target. */
export async function POST(request: Request) {
  const { adminUserId, error } = await requireAdmin();
  if (error) return error;

  const parsed = takedownSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await applyModerationTakedown({
      adminUserId,
      ...parsed.data,
    });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (e) {
    captureError('Moderation takedown failed', e);
    return NextResponse.json(
      { error: 'Takedown failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
