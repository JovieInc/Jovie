import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { runReleaseAutopilot } from '@/lib/services/release-autopilot';

const runRequestSchema = z.object({
  profileId: z.string().uuid(),
  releaseId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAdmin && !entitlements.canAccessMerchCreation) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Release autopilot merch drops require merch access. Upgrade to unlock this feature.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = runRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const ownership = await verifyProfileOwnership(
      db,
      parsed.data.profileId,
      userId
    );
    if (!ownership) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    const result = await runReleaseAutopilot({
      profileId: parsed.data.profileId,
      releaseId: parsed.data.releaseId,
      clerkUserId: userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await captureError('Release autopilot run failed', error, {
      route: '/api/release-autopilot/run',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
