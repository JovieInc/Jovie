/**
 * Full Extraction Flow
 *
 * Handles ingestion for platforms that support full profile extraction
 * (Linktree, Laylo) with avatar, display name, and all links.
 */

import { NextResponse } from 'next/server';
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

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Result of full extraction context resolution.
 */
export type FullExtractionContext =
  | {
      ok: true;
      validatedUrl: string;
      handle: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Resolves and validates the URL and handle for full extraction platforms.
 *
 * @param inputUrl - Input URL from user
 * @param isLayloProfile - Whether this is a Laylo profile
 * @param linktreeValidatedUrl - Validated Linktree URL (null if not Linktree)
 * @returns Context with validated URL and handle, or error response
 */
export function resolveFullExtractionContext(
  inputUrl: string,
  isLayloProfile: boolean,
  linktreeValidatedUrl: string | null
): FullExtractionContext {
  const validatedUrl = isLayloProfile
    ? validateLayloUrl(inputUrl)
    : linktreeValidatedUrl;

  if (!validatedUrl) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid profile URL',
          details: isLayloProfile
            ? 'URL must be a valid HTTPS Laylo profile (e.g., https://laylo.com/username)'
            : 'URL must be a valid HTTPS Linktree profile (e.g., https://linktr.ee/username)',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const rawHandle = isLayloProfile
    ? extractLayloHandle(validatedUrl)
    : extractLinktreeHandle(validatedUrl);

  if (!rawHandle) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unable to parse profile handle from URL.' },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const handle = isLayloProfile
    ? normalizeLayloHandle(rawHandle)
    : normalizeHandle(rawHandle);

  if (!isValidHandle(handle)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid handle format',
          details:
            'Handle must be 1-30 characters, alphanumeric and underscores only',
        },
        { status: 422, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, validatedUrl, handle };
}

/**
 * Fetches profile data from full extraction platforms.
 *
 * @param isLayloProfile - Whether this is a Laylo profile
 * @param validatedUrl - Validated profile URL
 * @param handle - Normalized handle
 * @returns Extracted profile data
 */
export async function fetchFullExtractionProfile(
  isLayloProfile: boolean,
  validatedUrl: string,
  handle: string
) {
  if (isLayloProfile) {
    const { profile: layloProfile, user } = await fetchLayloProfile(handle);
    return extractLaylo(layloProfile, user);
  }

  const html = await fetchLinktreeDocument(validatedUrl);
  return extractLinktree(html);
}

/**
 * Determines if the input URL is a full extraction platform.
 *
 * @param inputUrl - URL to check
 * @returns Object with platform type flags and validated Linktree URL
 */
export function detectFullExtractionPlatform(inputUrl: string): {
  isLinktree: boolean;
  isLaylo: boolean;
  linktreeValidatedUrl: string | null;
} {
  const isLaylo = isLayloUrl(inputUrl);
  const linktreeValidatedUrl = validateLinktreeUrl(inputUrl);
  const isLinktree = linktreeValidatedUrl !== null;

  return { isLinktree, isLaylo, linktreeValidatedUrl };
}
