import { NextResponse } from 'next/server';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import { validateLinktreeUrl } from '@/lib/ingestion/strategies/linktree';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { NO_STORE_HEADERS } from './ingest-constants';
import {
  handleFullExtractionPlatforms,
  handleSocialPlatformIngestion,
} from './ingest-handlers';
import { validateIngestRequest } from './ingest-validation';

export const runtime = 'nodejs';

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
    const validation = await validateIngestRequest(request);
    if (!validation.ok) {
      return validation.response;
    }

    const inputUrl = validation.data.url;
    const detected = detectPlatform(inputUrl);
    const platformId = detected.platform.id;
    const normalizedUrl = detected.normalizedUrl;

    const isLayloProfile = isLayloUrl(inputUrl);
    const linktreeValidatedUrl = validateLinktreeUrl(inputUrl);
    const isLinktreeProfile = linktreeValidatedUrl !== null;

    if (isLinktreeProfile || isLayloProfile) {
      return await handleFullExtractionPlatforms(
        inputUrl,
        isLayloProfile,
        linktreeValidatedUrl
      );
    }

    return await handleSocialPlatformIngestion({
      inputUrl,
      detected,
      normalizedUrl,
      platformId,
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
