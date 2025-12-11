import { randomUUID } from 'crypto';
import { put as uploadBlob } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { creatorProfiles } from '@/lib/db/schema';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
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
    const body = await request.json().catch(() => null);
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Strict URL validation
    const validatedUrl = validateLinktreeUrl(parsed.data.url);
    if (!validatedUrl) {
      return NextResponse.json(
        {
          error: 'Invalid Linktree URL',
          details:
            'URL must be a valid HTTPS Linktree profile (e.g., https://linktr.ee/username)',
        },
        { status: 400 }
      );
    }

    // Extract and validate handle
    const rawHandle = extractLinktreeHandle(validatedUrl);
    if (!rawHandle) {
      return NextResponse.json(
        { error: 'Unable to parse Linktree handle from URL.' },
        { status: 422 }
      );
    }

    // Normalize handle for storage
    const handle = normalizeHandle(rawHandle);
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
      // Race-safe duplicate check within transaction
      const [existing] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          {
            error: 'A creator profile with that handle already exists',
            existingProfileId: existing.id,
          },
          { status: 409 }
        );
      }

      // Fetch and extract Linktree data
      let html: string;
      let extraction: ReturnType<typeof extractLinktree>;
      try {
        html = await fetchLinktreeDocument(validatedUrl);
        extraction = extractLinktree(html);
      } catch (fetchError) {
        const errorMessage =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to fetch Linktree profile';

        logger.error('Linktree fetch failed', {
          url: validatedUrl,
          error: errorMessage,
        });

        return NextResponse.json(
          { error: 'Failed to fetch Linktree profile', details: errorMessage },
          { status: 502 }
        );
      }

      const displayName = extraction.displayName?.trim() || handle;
      const externalAvatarUrl = extraction.avatarUrl?.trim() || null;

      const hostedAvatarUrl = externalAvatarUrl
        ? await copyAvatarToBlob(externalAvatarUrl, handle)
        : null;

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
          username: handle,
          usernameNormalized,
          displayName,
          avatarUrl: hostedAvatarUrl,
          isPublic: true,
          isVerified: false,
          isFeatured: false,
          marketingOptOut: false,
          isClaimed: false,
          claimToken,
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
            usernameNormalized,
            avatarUrl: created.avatarUrl ?? null,
            displayName: created.displayName ?? displayName,
            avatarLockedByUser: false,
            displayNameLocked: false,
          },
          extraction
        );
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
    // Log full error for debugging ingestion failures
    // eslint-disable-next-line no-console
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
