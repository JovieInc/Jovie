/**
 * Base Extraction Utilities
 *
 * Common utility functions for ingestion strategies.
 */

import { normalizeString } from '@/lib/utils/string-utils';

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decodes common HTML entities.
 * Note: &amp; must be decoded LAST to avoid double-unescaping
 * (e.g., "&amp;lt;" should become "&lt;", not "<")
 */
export function decodeHtmlEntities(str: string): string {
  // Decode once; if already decoded, return as-is
  if (!str.includes('&')) {
    return str;
  }

  // Decode specific entities first, then ampersand last
  return str
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'")
    .replaceAll(/&#x27;/gi, "'")
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&'); // Must be last to avoid double-unescaping
}

/**
 * Validates a handle format (alphanumeric, underscores, dots, 1-30 chars).
 * More permissive than strict Linktree validation to support various platforms.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }

  // Allow alphanumeric, underscores, dots, hyphens
  // Must start and end with alphanumeric
  const normalized = handle.toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,28}[a-z0-9]$|^[a-z0-9]$/.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return normalizeString(handle).replace(/^@+/, '');
}
