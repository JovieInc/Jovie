import { NextResponse } from 'next/server';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { requireAuth, withDbSession } from '@/lib/auth/session';
import { isUniqueViolation } from '@/lib/db/errors';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { applyProfileUpdate } from '@/lib/domain/profile';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { getProfileByClerkId, NO_STORE_HEADERS } from './lib';

// Use Node.js runtime for compatibility with DB libs and server analytics
export const runtime = 'nodejs';

async function parseProfileUpdateRequest(req: Request) {
  const parsedBody = await parseJsonBody<{
    updates?: Record<string, unknown>;
    expectedVersion?: unknown;
    profileId?: unknown;
  } | null>(req, {
    route: 'PUT /api/dashboard/profile',
    headers: NO_STORE_HEADERS,
  });
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const updates = parsedBody.data?.updates ?? {};
  const expectedVersion = parsedBody.data?.expectedVersion;
  const profileId = parsedBody.data?.profileId;
  if (!isCanonicalUuid(profileId)) {
    return NextResponse.json(
      { error: 'A valid profileId is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (
    expectedVersion !== undefined &&
    (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1)
  ) {
    return NextResponse.json(
      { error: 'Invalid expected profile version' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  return {
    updates,
    profileId,
    expectedVersion:
      expectedVersion === undefined ? undefined : Number(expectedVersion),
  } as const;
}

export async function GET() {
  try {
    return await withDbSession(async clerkUserId => {
      const userProfile = await dashboardQuery(
        () => getProfileByClerkId(clerkUserId),
        'User profile fetch'
      );

      if (!userProfile) {
        return NextResponse.json(
          { error: "We couldn't find your profile." },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        { profile: userProfile.profile },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Profile fetch failed', error, {
        route: '/api/dashboard/profile',
        method: 'GET',
      });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Unable to load your profile right now.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const appUserId = await requireAuth();
    const parsedRequest = await parseProfileUpdateRequest(req);
    if (parsedRequest instanceof NextResponse) return parsedRequest;

    // The write is the shared domain function (also used by chat confirm-edit).
    const result = await applyProfileUpdate({
      appUserId,
      profileId: parsedRequest.profileId,
      updates: parsedRequest.updates,
      expectedVersion: parsedRequest.expectedVersion,
    });
    if (!result.ok) return result.response;

    return NextResponse.json(
      { profile: result.profile },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (
      isUniqueViolation(error, 'creator_profiles_username_normalized_unique')
    ) {
      return NextResponse.json(
        { error: 'Handle already taken' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    logger.error('Error updating profile:', error);
    if (!(error instanceof Error && error.message === 'Unauthorized')) {
      await captureError('Profile update failed', error, {
        route: '/api/dashboard/profile',
        method: 'PUT',
      });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
