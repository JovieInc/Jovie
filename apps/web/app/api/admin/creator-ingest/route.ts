import { put as uploadBlob } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { type DbType } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  calculateAndStoreFitScore,
  updatePaidTierScore,
} from '@/lib/fit-scoring';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { maybeCopyIngestionAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  enqueueFollowupIngestionJobs,
  normalizeAndMergeExtraction,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
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
import { creatorIngestSchema } from '@/lib/validation/schemas';

// Default claim token expiration: 30 days
const CLAIM_TOKEN_EXPIRY_DAYS = 30;

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

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isSafeExternalHttpsUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost') return false;
    if (hostname.endsWith('.local')) return false;
    if (hostname.endsWith('.internal')) return false;

    // Block raw IP addresses (IPv4/IPv6) to reduce SSRF risk.
    // We intentionally do not DNS-resolve here.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    if (hostname.includes(':')) return false;

    return true;
  } catch {
    return false;
  }
}

async function copyAvatarToBlob(
  sourceUrl: string,
  handle: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.warn('Skipping avatar copy: BLOB_READ_WRITE_TOKEN is not set');
    return null;
  }

  if (!isSafeExternalHttpsUrl(sourceUrl)) {
    logger.warn('Skipping avatar copy: unsafe avatar URL', {
      sourceUrl,
      handle,
    });
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
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/creator-ingest',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = creatorIngestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
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
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Extract and validate handle
    const rawHandle = isLayloProfile
      ? extractLayloHandle(validatedUrl)
      : extractLinktreeHandle(validatedUrl);

    if (!rawHandle) {
      return NextResponse.json(
        { error: 'Unable to parse profile handle from URL.' },
        { status: 422, headers: NO_STORE_HEADERS }
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
        { status: 422, headers: NO_STORE_HEADERS }
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
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      if (existing && existing.isClaimed) {
        return NextResponse.json(
          {
            error: 'Profile already claimed',
            details: 'Cannot overwrite a claimed profile.',
          },
          { status: 409, headers: NO_STORE_HEADERS }
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
          { status: 502, headers: NO_STORE_HEADERS }
        );
      }

      const displayName = extraction.displayName?.trim() || handle;
      const externalAvatarUrl = extraction.avatarUrl?.trim() || null;

      const hostedAvatarUrlFromProfile = externalAvatarUrl
        ? await copyAvatarToBlob(externalAvatarUrl, handle)
        : null;

      const hostedAvatarUrlFromLinks = hostedAvatarUrlFromProfile
        ? null
        : await maybeCopyIngestionAvatarFromLinks({
            handle,
            links: extraction.links
              .map(link => link.url)
              .filter((url): url is string => typeof url === 'string'),
          });

      const hostedAvatarUrl =
        hostedAvatarUrlFromProfile ?? hostedAvatarUrlFromLinks;

      const extractionWithHostedAvatar = {
        ...extraction,
        avatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
      };

      if (isReingest && existing) {
        await IngestionStatusManager.markProcessing(tx, existing.id);

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

        await IngestionStatusManager.markIdleOrFailed(
          tx,
          existing.id,
          mergeError
        );

        // Calculate fit score for the re-ingested profile
        try {
          // Update paid tier score if detected
          if (typeof extraction.hasPaidTier === 'boolean') {
            await updatePaidTierScore(tx, existing.id, extraction.hasPaidTier);
          }
          // Calculate full fit score
          await calculateAndStoreFitScore(tx, existing.id);
        } catch (fitScoreError) {
          logger.warn('Fit score calculation failed on reingest', {
            profileId: existing.id,
            error:
              fitScoreError instanceof Error
                ? fitScoreError.message
                : 'Unknown error',
          });
        }

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

      // Determine the source platform for fit scoring
      const sourcePlatform = isLayloProfile ? 'laylo' : 'linktree';

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
          ingestionSourcePlatform: sourcePlatform,
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
      await IngestionStatusManager.markIdleOrFailed(tx, created.id, mergeError);

      // Calculate fit score for the new profile
      try {
        // Update paid tier score if detected
        if (typeof extraction.hasPaidTier === 'boolean') {
          await updatePaidTierScore(tx, created.id, extraction.hasPaidTier);
        }
        // Calculate full fit score
        await calculateAndStoreFitScore(tx, created.id);
      } catch (fitScoreError) {
        // Log but don't fail the ingestion
        logger.warn('Fit score calculation failed', {
          profileId: created.id,
          error:
            fitScoreError instanceof Error
              ? fitScoreError.message
              : 'Unknown error',
        });
      }

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
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to ingest Linktree profile', details: errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
