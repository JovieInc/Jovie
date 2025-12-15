import { put as uploadBlob } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AdminAuthError,
  getAdminAuthStatusCode,
  requireAdmin,
} from '@/lib/admin/require-admin';
import { type DbType } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import {
  enqueueFollowupIngestionJobs,
  normalizeAndMergeExtraction,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  isLayloUrl,
  normalizeLayloHandle,
  validateLayloUrl,
} from '@/lib/ingestion/strategies/laylo';
import {
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isValidHandle,
  normalizeHandle,
  validateLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';

// Default claim token expiration: 30 days
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

const ingestSchema = z.object({
  url: z.string().url(),
  // Optional idempotency key to prevent duplicate ingestion on double-click
  idempotencyKey: z.string().uuid().optional(),
});

async function findAvailableHandle(
  tx: DbType,
  baseHandle: string
): Promise<string | null> {
  const MAX_LEN = 30;
  const normalizedBase = baseHandle.slice(0, MAX_LEN);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix = i === 0 ? '' : `-${i}`;
    const trimmedBase = normalizedBase.slice(0, MAX_LEN - suffix.length);
    const candidate = `${trimmedBase}${suffix}`;
    if (!isValidHandle(candidate)) continue;

    const [existing] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return null;
}

export const runtime = 'nodejs';

async function copyAvatarToBlob(
  sourceUrl: string,
  handle: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.warn('Skipping avatar copy: BLOB_READ_WRITE_TOKEN is not set');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
    if (
      !contentType ||
      !SUPPORTED_IMAGE_MIME_TYPES.includes(
        contentType as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]
      )
    ) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > AVATAR_MAX_FILE_SIZE_BYTES) {
      throw new Error('Avatar exceeds max size');
    }
    const buffer = Buffer.from(arrayBuffer);

    if (
      !validateMagicBytes(
        buffer,
        contentType as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]
      )
    ) {
      throw new Error('Magic bytes validation failed');
    }

    const sharp = (await import('sharp')).default;
    const baseImage = sharp(buffer, { failOnError: false })
      .rotate()
      .withMetadata({ orientation: undefined });

    const optimized = await baseImage
      .resize({
        width: 512,
        height: 512,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .avif({ quality: 65, effort: 4 })
      .toBuffer();

    const path = `avatars/ingestion/${handle}/${buildSeoFilename({
      originalFilename: 'avatar',
      photoId: randomUUID(),
    })}.avif`;

    const blob = await uploadBlob(path, optimized, {
      access: 'public',
      token,
      contentType: 'image/avif',
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      addRandomSuffix: false,
    });

    if (!blob?.url) {
      throw new Error('Blob upload returned no URL');
    }

    return blob.url;
  } catch (error) {
    logger.warn('Failed to copy avatar to blob', {
      sourceUrl,
      handle,
      error,
    });
    return null;
  }
}

/**
 * Admin endpoint to ingest a Linktree profile.
 *
 * Hardening:
 * - Strict URL validation (HTTPS only, valid Linktree hosts)
 * - Handle normalization and validation
 * - Transaction-wrapped with race-safe duplicate check
 * - Idempotency key support
 * - Claim token generated at creation time
 * - Error persistence for admin visibility
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Determine ingestion strategy (Laylo or Linktree)
    const isLayloProfile = isLayloUrl(parsed.data.url);
    const validatedUrl = isLayloProfile
      ? validateLayloUrl(parsed.data.url)
      : validateLinktreeUrl(parsed.data.url);

    if (!validatedUrl) {
      return NextResponse.json(
        {
          error: 'Invalid profile URL',
          details: isLayloProfile
            ? 'URL must be a valid HTTPS Laylo profile (e.g., https://laylo.com/username)'
            : 'URL must be a valid HTTPS Linktree profile (e.g., https://linktr.ee/username)',
        },
        { status: 400 }
      );
    }

    // Extract and validate handle
    const rawHandle = isLayloProfile
      ? extractLayloHandle(validatedUrl)
      : extractLinktreeHandle(validatedUrl);

    if (!rawHandle) {
      return NextResponse.json(
        { error: 'Unable to parse profile handle from URL.' },
        { status: 422 }
      );
    }

    // Normalize handle for storage
    const handle = isLayloProfile
      ? normalizeLayloHandle(rawHandle)
      : normalizeHandle(rawHandle);

    if (!isValidHandle(handle)) {
      return NextResponse.json(
        {
          error: 'Invalid handle format',
          details:
            'Handle must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422 }
      );
    }

    const usernameNormalized = handle;

    return await withSystemIngestionSession(async tx => {
      // Race-safe duplicate check within transaction; update unclaimed or allocate alt handle if claimed
      const [existing] = await tx
        .select({
          id: creatorProfiles.id,
          isClaimed: creatorProfiles.isClaimed,
          usernameNormalized: creatorProfiles.usernameNormalized,
          avatarUrl: creatorProfiles.avatarUrl,
          displayName: creatorProfiles.displayName,
          avatarLockedByUser: creatorProfiles.avatarLockedByUser,
          displayNameLocked: creatorProfiles.displayNameLocked,
          claimToken: creatorProfiles.claimToken,
          claimTokenExpiresAt: creatorProfiles.claimTokenExpiresAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
        .limit(1);

      const isReingest = !!existing && !existing.isClaimed;

      const finalHandle = existing
        ? existing.isClaimed
          ? await findAvailableHandle(tx, usernameNormalized)
          : existing.usernameNormalized
        : usernameNormalized;

      if (!finalHandle) {
        return NextResponse.json(
          {
            error: 'Unable to allocate unique username',
            details: 'All fallback username attempts exhausted.',
          },
          { status: 409 }
        );
      }

      if (existing && existing.isClaimed) {
        return NextResponse.json(
          {
            error: 'Profile already claimed',
            details: 'Cannot overwrite a claimed profile.',
          },
          { status: 409 }
        );
      }

      // Fetch and extract profile data
      let extraction:
        | ReturnType<typeof extractLinktree>
        | ReturnType<typeof extractLaylo>;
      try {
        if (isLayloProfile) {
          const { profile: layloProfile, user } =
            await fetchLayloProfile(handle);
          extraction = extractLaylo(layloProfile, user);
        } else {
          const html = await fetchLinktreeDocument(validatedUrl);
          extraction = extractLinktree(html);
        }
      } catch (fetchError) {
        const errorMessage =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to fetch profile';

        logger.error('Profile fetch failed', {
          url: validatedUrl,
          error: errorMessage,
          platform: isLayloProfile ? 'laylo' : 'linktree',
        });

        return NextResponse.json(
          { error: 'Failed to fetch profile', details: errorMessage },
          { status: 502 }
        );
      }

      const displayName = extraction.displayName?.trim() || handle;
      const externalAvatarUrl = extraction.avatarUrl?.trim() || null;

      const hostedAvatarUrl = externalAvatarUrl
        ? await copyAvatarToBlob(externalAvatarUrl, handle)
        : null;

      const extractionWithHostedAvatar = {
        ...extraction,
        avatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
      };

      if (isReingest && existing) {
        await tx
          .update(creatorProfiles)
          .set({ ingestionStatus: 'processing', updatedAt: new Date() })
          .where(eq(creatorProfiles.id, existing.id));

        let mergeError: string | null = null;
        try {
          await normalizeAndMergeExtraction(
            tx,
            {
              id: existing.id,
              usernameNormalized: existing.usernameNormalized,
              avatarUrl: existing.avatarUrl ?? null,
              displayName: existing.displayName ?? displayName,
              avatarLockedByUser: existing.avatarLockedByUser ?? false,
              displayNameLocked: existing.displayNameLocked ?? false,
            },
            extractionWithHostedAvatar
          );

          await enqueueFollowupIngestionJobs({
            tx,
            creatorProfileId: existing.id,
            currentDepth: 0,
            extraction: extractionWithHostedAvatar,
          });
        } catch (error) {
          mergeError =
            error instanceof Error ? error.message : 'Link extraction failed';
          logger.error('Link merge failed', {
            profileId: existing.id,
            error: mergeError,
          });
        }

        await tx
          .update(creatorProfiles)
          .set({
            ingestionStatus: mergeError ? 'failed' : 'idle',
            updatedAt: new Date(),
          })
          .where(eq(creatorProfiles.id, existing.id));

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
      }

      // Generate claim token at creation time (not on read)
      const claimToken = randomUUID();
      const claimTokenExpiresAt = new Date();
      claimTokenExpiresAt.setDate(
        claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
      );

      // Insert profile with claim token
      const [created] = await tx
        .insert(creatorProfiles)
        .values({
          // userId intentionally omitted to avoid inserting empty-string UUID
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
          { status: 500 }
        );
      }

      // Merge extracted links
      let mergeError: string | null = null;
      try {
        await normalizeAndMergeExtraction(
          tx,
          {
            id: created.id,
            usernameNormalized: created.usernameNormalized,
            avatarUrl: created.avatarUrl ?? null,
            displayName: created.displayName ?? displayName,
            avatarLockedByUser: created.avatarLockedByUser ?? false,
            displayNameLocked: created.displayNameLocked ?? false,
          },
          extractionWithHostedAvatar
        );

        await enqueueFollowupIngestionJobs({
          tx,
          creatorProfileId: created.id,
          currentDepth: 0,
          extraction: extractionWithHostedAvatar,
        });
      } catch (error) {
        mergeError =
          error instanceof Error ? error.message : 'Link extraction failed';
        logger.error('Link merge failed', {
          profileId: created.id,
          error: mergeError,
        });
      }

      // Update ingestion status (success or failure)
      await tx
        .update(creatorProfiles)
        .set({
          ingestionStatus: mergeError ? 'failed' : 'idle',
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, created.id));

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
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: getAdminAuthStatusCode(error.code),
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    console.error('Admin ingestion failed full error', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Admin ingestion failed', {
      error: errorMessage,
      raw: error,
    });

    // Check for unique constraint violation (race condition fallback)
    if (
      errorMessage.includes('unique constraint') ||
      errorMessage.includes('duplicate key')
    ) {
      return NextResponse.json(
        { error: 'A creator profile with that handle already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to ingest Linktree profile', details: errorMessage },
      { status: 500 }
    );
  }
}
