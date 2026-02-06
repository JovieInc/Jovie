import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
import { resolveHostedAvatarUrl } from '@/lib/ingestion/flows/avatar-hosting';
import {
  detectFullExtractionPlatform,
  fetchFullExtractionProfile,
  resolveFullExtractionContext,
} from '@/lib/ingestion/flows/full-extraction-flow';
import { extractHandleFromSocialUrl } from '@/lib/ingestion/flows/handle-extraction';
import {
  checkExistingProfile,
  findAvailableHandle,
  markReingestFailure,
} from '@/lib/ingestion/flows/profile-operations';
import {
  handleNewProfileIngest,
  handleReingestProfile,
} from '@/lib/ingestion/flows/reingest-flow';
import {
  createNewSocialProfile,
  handleExistingUnclaimedProfile,
  type SocialPlatformContext,
} from '@/lib/ingestion/flows/social-platform-flow';
import { fetchSpotifyArtistName } from '@/lib/ingestion/flows/spotify-integration';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  isValidHandle,
  normalizeHandle,
} from '@/lib/ingestion/strategies/linktree';
import {
  checkAdminCreatorIngestRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { creatorIngestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Validate a social handle extracted from a URL.
 *
 * @param inputUrl - Original URL to extract handle from
 * @param detectedPlatformName - Platform name for error messages
 * @returns Validated handle result or error response
 */
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
 * Process a full-extraction platform ingestion (Linktree/Laylo).
 */
async function processFullExtractionPlatform(
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
  const usernameNormalized = handle;
  const existingCheck = await checkExistingProfile(usernameNormalized);

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
    extraction = await fetchFullExtractionProfile(
      isLaylo,
      validatedUrl,
      handle
    );
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
 * Process a social platform ingestion (Instagram, TikTok, YouTube, etc.).
 */
async function processSocialPlatformIngestion(
  inputUrl: string,
  detected: ReturnType<typeof detectPlatform>
): Promise<NextResponse> {
  const handleResult = validateSocialHandle(inputUrl, detected.platform.name);
  if (!handleResult.ok) {
    return handleResult.response;
  }

  const { handle, normalizedHandle } = handleResult;
  const platformId = detected.platform.id;
  const spotifyArtistName = await fetchSpotifyArtistName(handle, platformId);

  const socialContext: SocialPlatformContext = {
    handle,
    normalizedHandle,
    platformId,
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
      return handleExistingUnclaimedProfile(tx, existing, socialContext);
    }

    return createNewSocialProfile(tx, finalHandle, socialContext);
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

    // Defensive check - userId should be defined after auth guards
    const adminUserId = entitlements.userId;
    if (!adminUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Rate limiting - prevents excessive external API calls from rapid ingestion
    const rateLimitResult = await checkAdminCreatorIngestRateLimit(adminUserId);
    if (!rateLimitResult.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: rateLimitResult.reason,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
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

    // Check if this is a full-extraction platform (Linktree/Laylo)
    const { isLinktree, isLaylo, linktreeValidatedUrl } =
      detectFullExtractionPlatform(inputUrl);

    // Route to appropriate handler
    if (isLinktree || isLaylo) {
      return processFullExtractionPlatform(
        inputUrl,
        isLaylo,
        linktreeValidatedUrl
      );
    }

    return processSocialPlatformIngestion(inputUrl, detected);
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
