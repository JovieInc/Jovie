import { put as uploadBlob } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { and, eq, max } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { type DbType } from '@/lib/db';
import { creatorProfiles, socialLinks } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
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
import { detectPlatform } from '@/lib/utils/platform-detection';
import { normalizeUrl } from '@/lib/utils/platform-detection/normalizer';
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

/**
 * Idempotently add a social link to a creator profile.
 * Checks if the link already exists, and if not, computes the next sortOrder.
 * Returns true if a new link was added, false if it already existed.
 */
async function addSocialLinkIdempotent(
  tx: DbType,
  creatorProfileId: string,
  platform: string,
  url: string,
  title: string
): Promise<boolean> {
  // Check if link already exists
  const [existingLink] = await tx
    .select({ id: socialLinks.id })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, creatorProfileId),
        eq(socialLinks.platform, platform),
        eq(socialLinks.url, url)
      )
    )
    .limit(1);

  if (existingLink) {
    // Link already exists, skip insertion
    return false;
  }

  // Compute next sortOrder (max + 1, or 0 if no links exist)
  const [result] = await tx
    .select({ maxOrder: max(socialLinks.sortOrder) })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, creatorProfileId));

  const nextSortOrder =
    result?.maxOrder !== null && result?.maxOrder !== undefined
      ? result.maxOrder + 1
      : 0;

  // Insert the new link
  await tx.insert(socialLinks).values({
    creatorProfileId,
    platform,
    platformType: platform,
    url,
    displayText: title,
    sortOrder: nextSortOrder,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return true;
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
 * Extract username/handle from a social platform URL.
 * Returns null if unable to extract a valid handle.
 */
function extractHandleFromSocialUrl(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    const pathname = parsed.pathname;

    // Remove leading/trailing slashes and get path segments
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    // Get the first meaningful segment (usually the username)
    let handle = segments[0];

    // Special cases for different platforms
    const hostname = parsed.hostname.toLowerCase();

    // YouTube: handle @username or /channel/ID or /c/name
    const youtubeHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'];
    if (youtubeHosts.includes(hostname)) {
      if (handle.startsWith('@')) {
        handle = handle.slice(1);
      } else if (
        (handle === 'channel' || handle === 'c' || handle === 'user') &&
        segments[1]
      ) {
        handle = segments[1];
      }
    }

    // TikTok: handle @username
    const tiktokHosts = ['tiktok.com', 'www.tiktok.com'];
    if (tiktokHosts.includes(hostname)) {
      if (handle.startsWith('@')) {
        handle = handle.slice(1);
      }
    }

    // LinkedIn: /in/username or /company/name
    const linkedinHosts = ['linkedin.com', 'www.linkedin.com'];
    if (linkedinHosts.includes(hostname)) {
      if ((handle === 'in' || handle === 'company') && segments[1]) {
        handle = segments[1];
      }
    }

    // Reddit: /user/username or /u/username
    const redditHosts = ['reddit.com', 'www.reddit.com'];
    if (redditHosts.includes(hostname)) {
      if ((handle === 'user' || handle === 'u') && segments[1]) {
        handle = segments[1];
      }
    }

    // Note: Discord invite codes are not usernames, so we don't extract them

    // Spotify: /artist/ID or /user/username
    const spotifyHosts = ['spotify.com', 'www.spotify.com'];
    if (spotifyHosts.includes(hostname)) {
      if (
        (handle === 'artist' || handle === 'user' || handle === 'playlist') &&
        segments[1]
      ) {
        handle = segments[1];
      }
    }

    // Clean up the handle
    handle = handle
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[?#].*$/, '') // Remove query strings/fragments
      .toLowerCase();

    // Validate handle format (30 char limit to match downstream validation)
    if (!handle || handle.length > 30) {
      return null;
    }

    // Only allow alphanumeric, underscores, hyphens, and periods
    if (!/^[a-z0-9._-]+$/.test(handle)) {
      return null;
    }

    return handle;
  } catch {
    return null;
  }
}

/**
 * Admin endpoint to ingest a creator profile from any social platform URL.
 *
 * Supported platforms:
 * - Full extraction (avatar, name, links): Linktree, Laylo
 * - Basic extraction (username only): Instagram, TikTok, Twitter/X, YouTube,
 *   Facebook, Spotify, and 40+ more platforms
 *
 * Hardening:
 * - Strict URL validation (HTTPS only)
 * - Handle normalization and validation
 * - Transaction-wrapped with race-safe duplicate check
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

    const inputUrl = parsed.data.url;

    // Detect platform from URL
    const detected = detectPlatform(inputUrl);
    const platformId = detected.platform.id;
    const normalizedUrl = detected.normalizedUrl;

    // Check if this is a full-extraction platform (Linktree/Laylo)
    const isLayloProfile = isLayloUrl(inputUrl);
    const linktreeValidatedUrl = validateLinktreeUrl(inputUrl);
    const isLinktreeProfile = linktreeValidatedUrl !== null;

    // For full-extraction platforms, use existing logic
    if (isLinktreeProfile || isLayloProfile) {
      const validatedUrl = isLayloProfile
        ? validateLayloUrl(inputUrl)
        : linktreeValidatedUrl;

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
        // Race-safe duplicate check within transaction
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

        // Generate claim token at creation time
        const claimToken = randomUUID();
        const claimTokenExpiresAt = new Date();
        claimTokenExpiresAt.setDate(
          claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
        );

        // Insert profile with claim token
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

        await IngestionStatusManager.markIdleOrFailed(
          tx,
          created.id,
          mergeError
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

    // For other social platforms, create a minimal profile with the URL as a link
    const handle = extractHandleFromSocialUrl(inputUrl);

    if (!handle) {
      return NextResponse.json(
        {
          error: 'Unable to extract username from URL',
          details: `Could not parse a valid username from the ${detected.platform.name} URL. Please ensure the URL points to a valid profile.`,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    // Validate handle format
    const normalizedHandle = normalizeHandle(handle);
    if (!isValidHandle(normalizedHandle)) {
      return NextResponse.json(
        {
          error: 'Invalid username format',
          details:
            'Username must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    return await withSystemIngestionSession(async tx => {
      // Check for existing profile
      const [existing] = await tx
        .select({
          id: creatorProfiles.id,
          isClaimed: creatorProfiles.isClaimed,
          usernameNormalized: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, normalizedHandle))
        .limit(1);

      // If profile exists and is claimed, allocate alternative handle
      let finalHandle = normalizedHandle;
      if (existing?.isClaimed) {
        const altHandle = await findAvailableHandle(tx, normalizedHandle);
        if (!altHandle) {
          return NextResponse.json(
            {
              error: 'Unable to allocate unique username',
              details: 'All fallback username attempts exhausted.',
            },
            { status: 409, headers: NO_STORE_HEADERS }
          );
        }
        finalHandle = altHandle;
      } else if (existing && !existing.isClaimed) {
        // Profile exists but unclaimed - add the link to existing profile
        try {
          // Add the social link to existing profile (idempotent)
          const linkAdded = await addSocialLinkIdempotent(
            tx,
            existing.id,
            platformId,
            normalizedUrl,
            detected.platform.name
          );

          if (linkAdded) {
            logger.info('Added link to existing unclaimed profile', {
              profileId: existing.id,
              platform: platformId,
              url: normalizedUrl,
            });
          } else {
            logger.info('Link already exists on unclaimed profile', {
              profileId: existing.id,
              platform: platformId,
              url: normalizedUrl,
            });
          }

          return NextResponse.json(
            {
              ok: true,
              profile: {
                id: existing.id,
                username: existing.usernameNormalized,
                usernameNormalized: existing.usernameNormalized,
              },
              links: linkAdded ? 1 : 0,
              note: linkAdded
                ? 'Added link to existing unclaimed profile'
                : 'Link already exists on profile',
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
          );
        } catch (linkError) {
          logger.warn('Failed to add link to existing profile', {
            profileId: existing.id,
            error: linkError,
          });
          // Continue to return success since profile exists
          return NextResponse.json(
            {
              ok: true,
              profile: {
                id: existing.id,
                username: existing.usernameNormalized,
                usernameNormalized: existing.usernameNormalized,
              },
              links: 0,
              warning: 'Profile exists but failed to add link',
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } }
          );
        }
      }

      // Generate claim token
      const claimToken = randomUUID();
      const claimTokenExpiresAt = new Date();
      claimTokenExpiresAt.setDate(
        claimTokenExpiresAt.getDate() + CLAIM_TOKEN_EXPIRY_DAYS
      );

      // Create new profile
      const [created] = await tx
        .insert(creatorProfiles)
        .values({
          creatorType: 'creator',
          username: finalHandle,
          usernameNormalized: finalHandle,
          displayName: handle, // Use original handle casing as display name
          avatarUrl: null,
          isPublic: true,
          isVerified: false,
          isFeatured: false,
          marketingOptOut: false,
          isClaimed: false,
          claimToken,
          claimTokenExpiresAt,
          settings: {},
          theme: {},
          ingestionStatus: 'idle',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          usernameNormalized: creatorProfiles.usernameNormalized,
          claimToken: creatorProfiles.claimToken,
        });

      if (!created) {
        return NextResponse.json(
          { error: 'Failed to create creator profile' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }

      // Add the social link (idempotent, though new profile shouldn't have duplicates)
      try {
        await addSocialLinkIdempotent(
          tx,
          created.id,
          platformId,
          normalizedUrl,
          detected.platform.name
        );
      } catch (linkError) {
        logger.warn('Failed to add link to new profile', {
          profileId: created.id,
          error: linkError,
        });
      }

      logger.info('Creator profile created from social URL', {
        profileId: created.id,
        handle: created.username,
        platform: platformId,
        sourceUrl: normalizedUrl,
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
          links: 1,
          platform: detected.platform.name,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Admin ingestion failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      raw: error,
      route: 'creator-ingest',
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
      { error: 'Failed to ingest profile', details: errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
