import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import {
  getAuthenticatedSubmissionRequest,
  getMetadataSubmissionStatus,
  verifySubmissionProfileOwnership,
} from '@/lib/submission-agent/service';

export async function GET(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId') ?? undefined;
    const profileId = url.searchParams.get('profileId') ?? undefined;
    const releaseId = url.searchParams.get('releaseId') ?? undefined;

    if (requestId) {
      const ownership = await getAuthenticatedSubmissionRequest(
        requestId,
        userId
      );
      if (!ownership?.request) {
        return NextResponse.json(
          { success: false, error: 'Submission request not found' },
          { status: 404 }
        );
      }
    } else if (profileId) {
      const ownership = await verifySubmissionProfileOwnership(
        profileId,
        userId
      );
      if (!ownership) {
        return NextResponse.json(
          { success: false, error: 'Profile not found' },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'requestId or profileId is required' },
        { status: 400 }
      );
    }

    const result = await getMetadataSubmissionStatus({
      requestId,
      profileId,
      releaseId,
    });

    return NextResponse.json({ success: true, requests: result });
  } catch (error) {
    await captureError('Metadata submission status failed', error, {
      route: '/api/metadata-submissions/status',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
