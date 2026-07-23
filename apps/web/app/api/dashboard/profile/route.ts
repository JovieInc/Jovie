import { NextResponse } from 'next/server';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { syncSocialLinksFromPrimaryMusicUrls } from '@/lib/db/social-links-sync';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import { refreshAppleWalletProfilePassForProfileId } from '@/lib/wallet/apple/profile-pass';
import type { ProfileUpdateInput } from './lib';
import {
  addAvatarCacheBust,
  buildProfileUpdateContext,
  finalizeProfileResponse,
  getProfileByClerkId,
  NO_STORE_HEADERS,
  parseProfileUpdates,
  updateProfileRecords,
  validateUpdatesPayload,
} from './lib';

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
  const updatesValidation = validateUpdatesPayload(updates);
  if (!updatesValidation.ok) {
    return updatesValidation.response;
  }

  const parsedUpdatesResult = parseProfileUpdates(updatesValidation.updates);
  if (!parsedUpdatesResult.ok) {
    return parsedUpdatesResult.response;
  }

  const parsedUpdates: ProfileUpdateInput = parsedUpdatesResult.parsed;
  const context = buildProfileUpdateContext(parsedUpdates);

  return {
    parsedUpdates,
    profileId,
    expectedVersion:
      expectedVersion === undefined ? undefined : Number(expectedVersion),
    ...context,
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
    const result = await withDbSessionTx(async (tx, appUserId) => {
      const parsedRequest = await parseProfileUpdateRequest(req);
      if (parsedRequest instanceof NextResponse) return parsedRequest;

      const {
        dbProfileUpdates,
        displayNameForUserUpdate,
        avatarUrl,
        usernameUpdate,
        expectedVersion,
        profileId,
      } = parsedRequest;
      const updateResult = await updateProfileRecords({
        tx,
        appUserId,
        profileId,
        dbProfileUpdates,
        displayNameForUserUpdate,
        usernameUpdate,
        expectedVersion,
      });
      if (updateResult instanceof NextResponse) {
        return updateResult;
      }

      return {
        ...updateResult,
        avatarUrl,
        appUserId,
        dbProfileUpdates,
      };
    });

    if (result instanceof NextResponse) return result;

    const {
      updatedProfile,
      oldUsernameNormalized,
      appUserId,
      dbProfileUpdates,
    } = result;
    await Promise.all([
      syncSocialLinksFromPrimaryMusicUrls(db, updatedProfile.id, {
        spotifyUrl: dbProfileUpdates.spotifyUrl as string | null | undefined,
        appleMusicUrl: dbProfileUpdates.appleMusicUrl as
          | string
          | null
          | undefined,
        youtubeUrl: dbProfileUpdates.youtubeUrl as string | null | undefined,
      }),
      refreshAppleWalletProfilePassForProfileId(updatedProfile.id),
      finalizeProfileResponse({
        updatedProfile,
        oldUsernameNormalized,
        clerkUserId: appUserId,
      }),
    ]);

    return NextResponse.json(
      { profile: addAvatarCacheBust(updatedProfile) },
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
