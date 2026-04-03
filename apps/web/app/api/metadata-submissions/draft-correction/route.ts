import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import {
  draftMetadataSubmissionCorrection,
  getAuthenticatedSubmissionRequest,
} from '@/lib/submission-agent/service';

const correctionRequestSchema = z.object({
  requestId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlements = await getCurrentUserEntitlements();
    if (
      !entitlements.isAdmin &&
      !entitlements.canAccessMetadataSubmissionAgent
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Metadata submission workflows require a Pro plan. Upgrade to unlock this feature.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = correctionRequestSchema.safeParse(body);
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

    const ownership = await getAuthenticatedSubmissionRequest(
      parsed.data.requestId,
      userId
    );
    if (!ownership?.request) {
      return NextResponse.json(
        { success: false, error: 'Submission request not found' },
        { status: 404 }
      );
    }

    const result = await draftMetadataSubmissionCorrection(
      parsed.data.requestId
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    await captureError('Metadata submission correction draft failed', error, {
      route: '/api/metadata-submissions/draft-correction',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
