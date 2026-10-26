import 'server-only';
import { NextResponse } from 'next/server';
import {
  addAvatarCacheBust,
  buildProfileUpdateContext,
  finalizeProfileResponse,
  getProfileUpdatePreflight,
  NO_STORE_HEADERS,
  type ProfileUpdateInput,
  parseProfileUpdates,
  readWritableProfileUsername,
  updateProfileRecords,
  validateUpdatesPayload,
} from '@/app/api/dashboard/profile/lib';
import { withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { syncSocialLinksFromPrimaryMusicUrls } from '@/lib/db/social-links-sync';
import { hasAdvancedFeatures } from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { buildThemeWithProfileAccent } from '@/lib/profile/profile-theme.server';
import { refreshAppleWalletProfilePassForProfileId } from '@/lib/wallet/apple/profile-pass';

/**
 * Profile edit: the ONE domain function behind the settings form
 * (`PUT /api/dashboard/profile`) and the chat edit confirmation
 * (`POST /api/chat/confirm-edit`). The chat route used to update
 * `creator_profiles` itself: no field validation, no `profileEditVersion` bump
 * (so it could silently clobber a concurrent form edit), no Clerk name sync, no
 * cache invalidation. Anything that edits a profile goes through here;
 * `chat-tools-use-domain.test.ts` pins that no chat route writes the table.
 *
 * Callers authenticate and pass the Clerk user id; ownership is enforced by the
 * same row-level checks the form always used.
 */
export type ApplyProfileUpdateResult =
  | {
      readonly ok: true;
      readonly profile: ReturnType<typeof addAvatarCacheBust>;
    }
  | { readonly ok: false; readonly response: NextResponse };

export async function applyProfileUpdate(input: {
  readonly appUserId: string;
  readonly profileId: string;
  readonly updates: unknown;
  readonly expectedVersion?: number;
}): Promise<ApplyProfileUpdateResult> {
  const { appUserId, profileId, expectedVersion } = input;
  const validated = validateUpdatesPayload(input.updates);
  if (!validated.ok) return { ok: false, response: validated.response };

  let currentUsername: string | null = null;
  if (typeof validated.updates.username === 'string') {
    currentUsername = await withDbSessionTx(
      tx => readWritableProfileUsername(tx, appUserId, profileId),
      { clerkUserId: appUserId }
    );
  }
  const parsedResult = parseProfileUpdates(validated.updates, {
    currentUsername,
  });
  if (!parsedResult.ok) return { ok: false, response: parsedResult.response };

  const parsedUpdates: ProfileUpdateInput = parsedResult.parsed;
  const {
    dbProfileUpdates,
    displayNameForUserUpdate,
    avatarUrl,
    usernameUpdate,
  } = buildProfileUpdateContext(parsedUpdates);

  if (parsedUpdates.settings?.require_double_opt_in === false) {
    const entitlements = await getCurrentUserEntitlements();
    if (!hasAdvancedFeatures(entitlements.plan)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Double opt-in can only be disabled on Max.' },
          { status: 403, headers: NO_STORE_HEADERS }
        ),
      };
    }
  }

  const avatarPreflight =
    avatarUrl === undefined
      ? undefined
      : await withDbSessionTx(
          tx => getProfileUpdatePreflight(tx, appUserId, profileId),
          { clerkUserId: appUserId }
        );
  if (avatarPreflight instanceof NextResponse)
    return { ok: false, response: avatarPreflight };

  const precomputedAvatarTheme =
    avatarUrl === undefined ||
    avatarUrl === avatarPreflight?.avatarUrl ||
    (expectedVersion !== undefined &&
      expectedVersion !== avatarPreflight?.profileEditVersion)
      ? undefined
      : await buildThemeWithProfileAccent({
          existingTheme: null,
          sourceUrl: avatarUrl,
        });

  const result = await withDbSessionTx(
    tx =>
      updateProfileRecords({
        tx,
        appUserId,
        profileId,
        dbProfileUpdates,
        displayNameForUserUpdate,
        usernameUpdate,
        expectedVersion,
        precomputedAvatarTheme,
        ...(avatarPreflight === undefined
          ? {}
          : { avatarPreflightVersion: avatarPreflight.profileEditVersion }),
      }),
    { clerkUserId: appUserId }
  );
  if (result instanceof NextResponse) return { ok: false, response: result };

  const { updatedProfile, oldUsernameNormalized } = result;
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
      privacyChanged:
        parsedUpdates.isPublic !== undefined ||
        parsedUpdates.settings?.searchable !== undefined,
    }),
  ]);

  return { ok: true, profile: addAvatarCacheBust(updatedProfile) };
}
