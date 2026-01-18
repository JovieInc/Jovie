/**
 * Handle Extraction Utilities
 *
 * Extracts and validates platform handles from URL paths.
 */

import { isValidHandle } from './utils';

/**
 * Result of handle extraction from URL path.
 */
export interface HandleExtractionResult {
  success: boolean;
  handle: string | null;
}

/**
 * Extracts platform handle from URL pathname.
 * Handles common patterns like /username or /@username.
 *
 * @param pathname - The URL pathname (e.g., "/username" or "/@username/posts")
 * @returns Extraction result with normalized handle
 */
export function extractHandle(pathname: string): HandleExtractionResult {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { success: false, handle: null };
  }

  // Extract first path segment, remove @ prefix if present
  const rawHandle = parts[0].replace(/^@/, '').toLowerCase();

  if (!isValidHandle(rawHandle)) {
    return { success: false, handle: null };
  }

  return { success: true, handle: rawHandle };
}

/**
 * Constructs canonical platform URL from host and handle.
 *
 * @param canonicalHost - The canonical hostname for the platform
 * @param handle - The validated platform handle
 * @returns Canonical HTTPS URL
 */
export function buildCanonicalUrl(
  canonicalHost: string,
  handle: string
): string {
  return `https://${canonicalHost}/${handle}`;
}
