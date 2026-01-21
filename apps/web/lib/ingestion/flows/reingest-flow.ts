/**
 * Re-ingest Flow
 *
 * Handles re-ingesting existing profiles and creating new profiles
 * from full-extraction platforms (Linktree, Laylo).
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';
import type { fetchFullExtractionProfile } from './full-extraction-flow';
import type { checkExistingProfile } from './profile-operations';
import { processProfileExtraction } from './profile-processing';
import { generateClaimToken } from './social-platform-flow';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Existing profile data for reingest handling
 */
export interface ExistingProfileForReingest {
  id: string;
  usernameNormalized: string;
  avatarUrl: string | null;
  displayName: string | null;
  claimToken: string | null;
  avatarLockedByUser: boolean | null;
  displayNameLocked: boolean | null;
}

/**
 * Handle re-ingesting an existing unclaimed profile.
 *
 * Updates the profile with fresh extraction data without creating a new profile.
 *
 * @param params - Parameters for reingest
 * @param params.existing - Existing profile data
 * @param params.extraction - Fresh extraction data
 * @param params.displayName - Display name to use
 * @returns NextResponse with result
 */
export async function handleReingestProfile({
  existing,
  extraction,
  displayName,
}: {
  existing: NonNullable<
    Awaited<ReturnType<typeof checkExistingProfile>>['existing']
  >;
  extraction: Awaited<ReturnType<typeof fetchFullExtractionProfile>>;
  displayName: string;
}): Promise<NextResponse> {
  return withSystemIngestionSession(async tx => {
    const { mergeError } = await processProfileExtraction(
      tx,
      {
        id: existing.id,
        usernameNormalized: existing.usernameNormalized,
        avatarUrl: existing.avatarUrl ?? null,
        displayName: existing.displayName,
        avatarLockedByUser: existing.avatarLockedByUser ?? false,
        displayNameLocked: existing.displayNameLocked ?? false,
      },
      extraction,
      displayName
    );

    return NextResponse.json(
      {
        ok: !mergeError,
        profile: {
          id: existing.id,
          username: existing.usernameNormalized,
          usernameNormalized: existing.usernameNormalized,
          claimToken: existing.claimToken,
        },
        links: extraction.links.length,
        warning: mergeError
          ? `Profile updated but link extraction had issues: ${mergeError}`
          : undefined,
      },
      {
        status: mergeError ? 207 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  });
}

/**
 * Handle creating a new profile from full-extraction data.
 *
 * Creates a new creator profile with extracted links, avatar, and metadata.
 *
 * @param params - Parameters for new profile creation
 * @param params.finalHandle - Final handle to use (may differ from extracted if conflicts)
 * @param params.displayName - Display name for the profile
 * @param params.hostedAvatarUrl - Hosted avatar URL (already copied to blob storage)
 * @param params.extraction - Extraction data with links and metadata
 * @returns NextResponse with result
 */
export async function handleNewProfileIngest({
  finalHandle,
  displayName,
  hostedAvatarUrl,
  extraction,
}: {
  finalHandle: string;
  displayName: string;
  hostedAvatarUrl: string | null;
  extraction: Awaited<ReturnType<typeof fetchFullExtractionProfile>>;
}): Promise<NextResponse> {
  return withSystemIngestionSession(async tx => {
    const { claimToken, claimTokenExpiresAt } = generateClaimToken();

    const [created] = await tx
      .insert(creatorProfiles)
      .values({
        creatorType: 'creator',
        username: finalHandle,
        usernameNormalized: finalHandle,
        displayName,
        avatarUrl: hostedAvatarUrl,
        isPublic: true,
        isVerified: false,
        isFeatured: false,
        marketingOptOut: false,
        isClaimed: false,
        claimToken,
        claimTokenExpiresAt,
        settings: {},
        theme: {},
        ingestionStatus: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        claimToken: creatorProfiles.claimToken,
        isClaimed: creatorProfiles.isClaimed,
        claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
        avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        displayNameLocked: creatorProfiles.displayNameLocked,
      });

    if (!created) {
      return NextResponse.json(
        { error: 'Failed to create creator profile' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const { mergeError } = await processProfileExtraction(
      tx,
      {
        id: created.id,
        usernameNormalized: created.usernameNormalized,
        avatarUrl: created.avatarUrl ?? null,
        displayName: created.displayName,
        avatarLockedByUser: created.avatarLockedByUser ?? false,
        displayNameLocked: created.displayNameLocked ?? false,
      },
      extraction,
      displayName
    );

    logger.info('Creator profile ingested', {
      profileId: created.id,
      handle: created.username,
      linksExtracted: extraction.links.length,
      hadError: !!mergeError,
    });

    return NextResponse.json(
      {
        ok: true,
        profile: {
          id: created.id,
          username: created.username,
          usernameNormalized: created.usernameNormalized,
          claimToken: created.claimToken,
        },
        links: extraction.links.length,
        warning: mergeError
          ? `Profile created but link extraction had issues: ${mergeError}`
          : undefined,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
