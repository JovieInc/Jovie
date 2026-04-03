import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { getSubmissionProvidersForApi } from '@/lib/submission-agent/service';

export async function GET() {
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

    const providers = await getSubmissionProvidersForApi();
    return NextResponse.json({ success: true, providers });
  } catch (error) {
    await captureError('Metadata submission providers route failed', error, {
      route: '/api/metadata-submissions/providers',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
