import { randomUUID } from 'node:crypto';
import { put as uploadBlob } from '@vercel/blob';
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
import {
  detectFullExtractionPlatform,
  fetchFullExtractionProfile,
  resolveFullExtractionContext,
} from '@/lib/ingestion/flows/full-extraction-flow';
import {
  checkExistingProfile,
  findAvailableHandle,
  markReingestFailure,
} from '@/lib/ingestion/flows/profile-operations';
import {
  createNewSocialProfile,
  generateClaimToken,
  handleExistingUnclaimedProfile,
  type SocialPlatformContext,
} from '@/lib/ingestion/flows/social-platform-flow';
import { maybeCopyIngestionAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import {
  enqueueFollowupIngestionJobs,
  normalizeAndMergeExtraction,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import {
  isValidHandle,
  normalizeHandle,
} from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { normalizeUrl } from '@/lib/utils/platform-detection/normalizer';
import { creatorIngestSchema } from '@/lib/validation/schemas';

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
 * Platform-specific handle extraction strategies.
 * Maps hostname patterns to extraction logic for different social platforms.
 */
const PLATFORM_EXTRACTION_STRATEGIES: Record<
  string,
  {
    hosts: string[];
    extract: (segments: string[]) => string | null;
  }
> = {
  youtube: {
    hosts: ['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'],
    extract: (segments: string[]): string | null => {
      let handle = segments[0];
      // Handle @username or /channel/ID or /c/name or /user/name
      if (handle?.startsWith('@')) {
        return handle.slice(1);
      }
      if (
        (handle === 'channel' || handle === 'c' || handle === 'user') &&
        segments[1]
      ) {
        return segments[1];
      }
      return handle;
    },
  },
  tiktok: {
    hosts: ['tiktok.com', 'www.tiktok.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle @username format
      return handle?.startsWith('@') ? handle.slice(1) : handle;
    },
  },
  linkedin: {
    hosts: ['linkedin.com', 'www.linkedin.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /in/username or /company/name
      if ((handle === 'in' || handle === 'company') && segments[1]) {
        return segments[1];
      }
      return handle;
    },
  },
  reddit: {
    hosts: ['reddit.com', 'www.reddit.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /user/username or /u/username
      if ((handle === 'user' || handle === 'u') && segments[1]) {
        return segments[1];
      }
      return handle;
    },
  },
  spotify: {
    hosts: ['spotify.com', 'www.spotify.com', 'open.spotify.com'],
    extract: (segments: string[]): string | null => {
      const handle = segments[0];
      // Handle /artist/ID or /user/username
      if (handle === 'artist' && segments[1]) {
        // Store the full artist ID with prefix for later API lookup
        return `artist-${segments[1]}`;
      }
      if (handle === 'user' && segments[1]) {
        return segments[1];
      }
      // Playlists aren't creator profiles
      if (handle === 'playlist') {
        return null;
      }
      return handle;
    },
  },
};

/**
 * Extract username/handle from a social platform URL.
 * Uses platform-specific strategies to handle different URL formats.
 *
 * @param url - Social platform profile URL
 * @returns Extracted handle/username, or null if extraction fails
 */
function extractHandleFromSocialUrl(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    const hostname = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    // Find matching platform strategy
    const strategy = Object.values(PLATFORM_EXTRACTION_STRATEGIES).find(s =>
      s.hosts.includes(hostname)
    );

    // Extract handle using platform strategy or fallback to first segment
    let handle = strategy ? strategy.extract(segments) : segments[0];

    if (!handle) {
      return null;
    }

    // Clean up the handle
    handle = handle
      .replace(/^@/, '') // Remove @ prefix
      .replace(/[?#].*/, '') // Remove query strings/fragments (safe: greedy match, no backtracking)
      .toLowerCase();

    // Validate handle format (30 char limit to match downstream validation)
    if (handle.length > 30) {
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
 * Process profile extraction: merge links, enqueue follow-up jobs, and calculate fit score.
 *
 * This consolidates the shared logic used in both re-ingest and new profile flows.
 * Handles errors gracefully and ensures ingestion status is marked appropriately.
 *
 * @param tx - Database transaction
 * @param profile - Profile information for merging
 * @param extraction - Extracted profile data with links and metadata
 * @param displayName - Display name to use if not locked
 * @returns Object with mergeError if link processing failed
 */
async function processProfileExtraction(
  tx: DbType,
  profile: {
    id: string;
    usernameNormalized: string;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean;
    displayNameLocked: boolean;
  },
  extraction: {
    links: Array<{ url: string; platformId?: string; title?: string }>;
    avatarUrl?: string | null;
    hasPaidTier?: boolean | null;
    displayName?: string | null;
  },
  displayName: string | null
): Promise<{ mergeError: string | null }> {
  let mergeError: string | null = null;

  // Merge extracted links into profile
  try {
    await normalizeAndMergeExtraction(
      tx,
      {
        id: profile.id,
        usernameNormalized: profile.usernameNormalized,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName ?? displayName,
        avatarLockedByUser: profile.avatarLockedByUser,
        displayNameLocked: profile.displayNameLocked,
      },
      extraction
    );

    // Enqueue follow-up ingestion jobs for discovered links
    await enqueueFollowupIngestionJobs({
      tx,
      creatorProfileId: profile.id,
      currentDepth: 0,
      extraction,
    });
  } catch (error) {
    mergeError =
      error instanceof Error ? error.message : 'Link extraction failed';
    logger.error('Link merge failed', {
      profileId: profile.id,
      error: mergeError,
    });
  }

  // Mark ingestion as idle or failed based on merge result
  await IngestionStatusManager.markIdleOrFailed(tx, profile.id, mergeError);

  // Calculate fit score for the profile
  try {
    if (typeof extraction.hasPaidTier === 'boolean') {
      await updatePaidTierScore(tx, profile.id, extraction.hasPaidTier);
    }
    await calculateAndStoreFitScore(tx, profile.id);
  } catch (fitScoreError) {
    logger.warn('Fit score calculation failed', {
      profileId: profile.id,
      error:
        fitScoreError instanceof Error
          ? fitScoreError.message
          : 'Unknown error',
    });
  }

  return { mergeError };
}

async function resolveHostedAvatarUrl(
  handle: string,
  extraction: { avatarUrl?: string | null; links: Array<{ url?: string }> }
) {
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

  return hostedAvatarUrlFromProfile ?? hostedAvatarUrlFromLinks;
}

async function handleReingestProfile({
  existing,
  extraction,
  displayName,
}: {
  existing: NonNullable<
    Awaited<ReturnType<typeof checkExistingProfile>>['existing']
  >;
  extraction: Awaited<ReturnType<typeof fetchFullExtractionProfile>>;
  displayName: string;
}) {
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

async function handleNewProfileIngest({
  finalHandle,
  displayName,
  hostedAvatarUrl,
  extraction,
}: {
  finalHandle: string;
  displayName: string;
  hostedAvatarUrl: string | null;
  extraction: Awaited<ReturnType<typeof fetchFullExtractionProfile>>;
}) {
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

async function fetchSpotifyArtistName(
  handle: string,
  platformId: string
): Promise<string | null> {
  const isSpotifyArtist =
    handle.startsWith('artist-') && platformId === 'spotify';
  if (!isSpotifyArtist) {
    return null;
  }

  try {
    const { getSpotifyArtist } = await import('@/lib/spotify');
    const artistId = handle.replace('artist-', '');
    const artist = await getSpotifyArtist(artistId);
    if (artist?.name) {
      logger.info('Fetched Spotify artist name', {
        artistId,
        name: artist.name,
      });
      return artist.name;
    }
  } catch (error) {
    logger.warn('Failed to fetch Spotify artist name', {
      handle,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return null;
}

function validateSocialHandle(
  inputUrl: string,
  detectedPlatformName: string
):
  | { ok: true; handle: string; normalizedHandle: string }
  | { ok: false; response: NextResponse } {
  const handle = extractHandleFromSocialUrl(inputUrl);

  if (!handle) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Unable to extract username from URL',
          details: `Could not parse a valid username from the ${detectedPlatformName} URL. Please ensure the URL points to a valid profile.`,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const normalizedHandle = normalizeHandle(handle);
  if (!isValidHandle(normalizedHandle)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid username format',
          details:
            'Username must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, handle, normalizedHandle };
}

/**
 * Validate admin access and return error response if unauthorized
 */
async function validateAdminAccess(): Promise<NextResponse | null> {
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

  return null;
}

/**
 * Parse and validate the request body
 */
async function parseAndValidateBody(
  request: Request
): Promise<{ ok: true; url: string } | { ok: false; response: NextResponse }> {
  const parsedBody = await parseJsonBody<unknown>(request, {
    route: 'POST /api/admin/creator-ingest',
    headers: NO_STORE_HEADERS,
  });

  if (!parsedBody.ok) {
    return { ok: false, response: parsedBody.response };
  }

  const parsed = creatorIngestSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, url: parsed.data.url };
}

/**
 * Handle ingestion errors with appropriate responses
 */
function handleIngestionError(error: unknown): NextResponse {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  logger.error('Admin ingestion failed', {
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    raw: error,
    route: 'creator-ingest',
  });

  const isConflictError =
    errorMessage.includes('unique constraint') ||
    errorMessage.includes('duplicate key');

  if (isConflictError) {
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

/**
 * Handle full-extraction platform ingestion (Linktree/Laylo)
 */
async function handleFullExtractionIngestion(
  inputUrl: string,
  isLaylo: boolean,
  linktreeValidatedUrl: string | null
): Promise<NextResponse> {
  const context = resolveFullExtractionContext(
    inputUrl,
    isLaylo,
    linktreeValidatedUrl
  );

  if (!context.ok) {
    return context.response;
  }

  const { validatedUrl, handle } = context;
  const existingCheck = await checkExistingProfile(handle);

  if (!existingCheck.finalHandle) {
    return NextResponse.json(
      {
        error: 'Unable to allocate unique username',
        details: 'All fallback username attempts exhausted.',
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  if (existingCheck.existing?.isClaimed) {
    return NextResponse.json(
      {
        error: 'Profile already claimed',
        details: 'Cannot overwrite a claimed profile.',
      },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  let extraction: Awaited<ReturnType<typeof fetchFullExtractionProfile>>;
  try {
    extraction = await fetchFullExtractionProfile(isLaylo, validatedUrl, handle);
  } catch (fetchError) {
    const errorMessage =
      fetchError instanceof Error
        ? fetchError.message
        : 'Failed to fetch profile';

    logger.error('Profile fetch failed', {
      url: validatedUrl,
      error: errorMessage,
      platform: isLaylo ? 'laylo' : 'linktree',
    });

    await markReingestFailure(existingCheck, errorMessage);

    return NextResponse.json(
      { error: 'Failed to fetch profile', details: errorMessage },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  const displayName = extraction.displayName?.trim() || handle;
  const hostedAvatarUrl = await resolveHostedAvatarUrl(handle, extraction);

  const extractionWithHostedAvatar = {
    ...extraction,
    avatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
  };

  if (existingCheck.isReingest && existingCheck.existing) {
    return handleReingestProfile({
      existing: existingCheck.existing,
      extraction: extractionWithHostedAvatar,
      displayName,
    });
  }

  return handleNewProfileIngest({
    finalHandle: existingCheck.finalHandle,
    displayName,
    hostedAvatarUrl,
    extraction: extractionWithHostedAvatar,
  });
}

/**
 * Handle social platform ingestion (Instagram, TikTok, etc.)
 */
async function handleSocialPlatformIngestion(
  inputUrl: string,
  detected: ReturnType<typeof detectPlatform>
): Promise<NextResponse> {
  const handleResult = validateSocialHandle(inputUrl, detected.platform.name);
  if (!handleResult.ok) {
    return handleResult.response;
  }

  const { handle, normalizedHandle } = handleResult;
  const spotifyArtistName = await fetchSpotifyArtistName(
    handle,
    detected.platform.id
  );

  const socialContext: SocialPlatformContext = {
    handle,
    normalizedHandle,
    platformId: detected.platform.id,
    platformName: detected.platform.name,
    normalizedUrl: detected.normalizedUrl,
    spotifyArtistName,
  };

  return withSystemIngestionSession(async tx => {
    const [existing] = await tx
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, normalizedHandle))
      .limit(1);

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
      return createNewSocialProfile(tx, altHandle, socialContext);
    }

    if (existing && !existing.isClaimed) {
      return handleExistingUnclaimedProfile(tx, existing, socialContext);
    }

    return createNewSocialProfile(tx, normalizedHandle, socialContext);
  });
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
    const authError = await validateAdminAccess();
    if (authError) {
      return authError;
    }

    const bodyResult = await parseAndValidateBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const inputUrl = bodyResult.url;
    const detected = detectPlatform(inputUrl);
    const { isLinktree, isLaylo, linktreeValidatedUrl } =
      detectFullExtractionPlatform(inputUrl);

    if (isLinktree || isLaylo) {
      return handleFullExtractionIngestion(
        inputUrl,
        isLaylo,
        linktreeValidatedUrl
      );
    }

    return handleSocialPlatformIngestion(inputUrl, detected);
  } catch (error) {
    return handleIngestionError(error);
  }
}
