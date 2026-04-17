import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { syncSocialLinksFromPrimaryMusicUrls } from '@/lib/db/social-links-sync';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';
import type { ProfileUpdateInput } from './lib';
import {
  addAvatarCacheBust,
  buildClerkUpdates,
  buildProfileUpdateContext,
  finalizeProfileResponse,
  getProfileByClerkId,
  guardUsernameUpdate,
  handleTestProfileUpdate,
  NO_STORE_HEADERS,
  parseProfileUpdates,
  syncClerkProfile,
  updateProfileRecords,
  validateUpdatesPayload,
} from './lib';

// Use Node.js runtime for compatibility with DB libs and server analytics
export const runtime = 'nodejs';

async function parseProfileUpdateRequest(req: Request) {
  const parsedBody = await parseJsonBody<{
    updates?: Record<string, unknown>;
  } | null>(req, {
    route: 'PUT /api/dashboard/profile',
    headers: NO_STORE_HEADERS,
  });
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const updates = parsedBody.data?.updates ?? {};
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
    ...context,
  } as const;
}

async function attemptClerkRollback(
  rollback: (() => Promise<void>) | undefined,
  clerkUserId: string,
  context: string
) {
  if (!rollback) return;

  try {
    await rollback();
  } catch (error) {
    logger.error('Failed to rollback Clerk profile update:', {
      error: error instanceof Error ? error.message : error,
      clerkUserId,
      context,
    });
    await captureError('Clerk profile rollback failed', error, {
      route: '/api/dashboard/profile',
      context,
    });
  }
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
    return await withDbSession(async clerkUserId => {
      const parsedRequest = await parseProfileUpdateRequest(req);
      if (parsedRequest instanceof NextResponse) return parsedRequest;

      const {
        dbProfileUpdates,
        displayNameForUserUpdate,
        avatarUrl,
        usernameUpdate,
      } = parsedRequest;
      const currentProfileRecord = await getProfileByClerkId(clerkUserId);
      const currentProfile = currentProfileRecord?.profile ?? null;
      const effectiveDisplayNameForUserUpdate =
        displayNameForUserUpdate &&
        displayNameForUserUpdate !== currentProfile?.displayName
          ? displayNameForUserUpdate
          : undefined;
      const effectiveAvatarUrl =
        avatarUrl && avatarUrl !== currentProfile?.avatarUrl
          ? avatarUrl
          : undefined;
      const effectiveUsernameUpdate =
        usernameUpdate && usernameUpdate !== currentProfile?.username
          ? usernameUpdate
          : undefined;

      if (process.env.NODE_ENV === 'test') {
        return handleTestProfileUpdate({
          clerkUserId,
          dbProfileUpdates,
          usernameUpdate: effectiveUsernameUpdate,
          displayNameForUserUpdate: effectiveDisplayNameForUserUpdate,
          avatarUrl: effectiveAvatarUrl,
        });
      }

      const usernameGuard = await guardUsernameUpdate(
        clerkUserId,
        effectiveUsernameUpdate
      );
      if (usernameGuard instanceof NextResponse) return usernameGuard;

      const clerkUpdates = buildClerkUpdates(effectiveDisplayNameForUserUpdate);
      const { clerkSyncFailed, rollback } = await syncClerkProfile({
        clerkUserId,
        clerkUpdates,
        avatarUrl: effectiveAvatarUrl,
      });

      let updateResult;
      try {
        updateResult = await updateProfileRecords({
          clerkUserId,
          dbProfileUpdates,
          displayNameForUserUpdate: effectiveDisplayNameForUserUpdate,
        });
      } catch (error) {
        await attemptClerkRollback(rollback, clerkUserId, 'db_update_failed');
        throw error;
      }
      if (updateResult instanceof NextResponse) {
        await attemptClerkRollback(rollback, clerkUserId, 'db_update_response');
        return updateResult;
      }

      const { updatedProfile, oldUsernameNormalized } = updateResult;

      // Run independent post-update operations in parallel.
      await Promise.all([
        syncSocialLinksFromPrimaryMusicUrls(db, updatedProfile.id, {
          spotifyUrl: dbProfileUpdates.spotifyUrl as string | null | undefined,
          appleMusicUrl: dbProfileUpdates.appleMusicUrl as
            | string
            | null
            | undefined,
          youtubeUrl: dbProfileUpdates.youtubeUrl as string | null | undefined,
        }),
        finalizeProfileResponse({
          updatedProfile,
          oldUsernameNormalized,
          clerkUserId,
        }),
      ]);

      const responseProfile = addAvatarCacheBust(updatedProfile);

      return NextResponse.json(
        {
          profile: responseProfile,
          warning: clerkSyncFailed
            ? 'Profile updated, but your photo might take a little longer to refresh. Please try again in a moment if it still looks out of date.'
            : undefined,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
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
