import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import {
  getAuthenticatedSubmissionRequest,
  getMetadataSubmissionStatus,
  verifySubmissionProfileOwnership,
} from '@/lib/submission-agent/service';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isMissingMetadataSubmissionStorage(
  error: unknown
): error is { code?: string; message?: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const nestedCause = 'cause' in error ? error.cause : null;
  if (nestedCause && isMissingMetadataSubmissionStorage(nestedCause)) {
    return true;
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : null;
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

  return (
    (code === '42P01' && message.includes('metadata_submission')) ||
    (message.includes('relation') &&
      message.includes('does not exist') &&
      message.includes('metadata_submission'))
  );
}

export async function GET(request: Request) {
  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
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
        { status: 403, headers: NO_STORE_HEADERS }
      );
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
          { status: 404, headers: NO_STORE_HEADERS }
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
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'requestId or profileId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await getMetadataSubmissionStatus({
      requestId,
      profileId,
      releaseId,
    });

    return NextResponse.json(
      { success: true, requests: result },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isMissingMetadataSubmissionStorage(error)) {
      return NextResponse.json(
        {
          success: true,
          requests: [],
          storageAvailable: false,
          error:
            'Metadata submission storage is not available in this environment.',
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    await captureError('Metadata submission status failed', error, {
      route: '/api/metadata-submissions/status',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
