import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
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

export async function GET() {
  try {
    return await withDbSession(async clerkUserId => {
      const userProfile = await getProfileByClerkId(clerkUserId);

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

      // Gate pro-only settings behind plan entitlements
      const settings = dbProfileUpdates.settings as
        | Record<string, unknown>
        | undefined;
      if (settings?.hide_branding === true) {
        try {
          const entitlements = await getCurrentUserEntitlements();
          if (!entitlements.canRemoveBranding) {
            return NextResponse.json(
              {
                error:
                  'Removing branding requires a Pro plan. Upgrade to unlock this feature.',
              },
              { status: 403, headers: NO_STORE_HEADERS }
            );
          }
        } catch {
          return NextResponse.json(
            { error: 'Unable to verify plan status. Please try again.' },
            { status: 503, headers: NO_STORE_HEADERS }
          );
        }
      }

      if (process.env.NODE_ENV === 'test') {
        return handleTestProfileUpdate({
          clerkUserId,
          usernameUpdate,
          displayNameForUserUpdate,
          avatarUrl,
        });
      }

      const usernameGuard = await guardUsernameUpdate(
        clerkUserId,
        usernameUpdate
      );
      if (usernameGuard instanceof NextResponse) return usernameGuard;

      const clerkUpdates = buildClerkUpdates(displayNameForUserUpdate);
      const [clerkSyncFailed, updatedProfile] = await Promise.all([
        syncClerkProfile({
          clerkUserId,
          clerkUpdates,
          avatarUrl,
        }),
        updateProfileRecords({
          clerkUserId,
          dbProfileUpdates,
          displayNameForUserUpdate,
        }),
      ]);
      if (updatedProfile instanceof NextResponse) return updatedProfile;

      await finalizeProfileResponse({
        updatedProfile,
        clerkUserId,
      });

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
