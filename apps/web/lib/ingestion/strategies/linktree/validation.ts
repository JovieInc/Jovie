/**
 * Linktree URL and Handle Validation
 *
 * Functions for validating and normalizing Linktree URLs and handles.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import {
  normalizeHandle as baseNormalizeHandle,
  isPlatformUrl,
  validatePlatformUrl,
} from '../base';
import { LINKTREE_CONFIG, LINKTREE_HANDLE_REGEX } from './config';

/**
 * Validates a Linktree handle format.
 * Linktree handles are more restrictive: alphanumeric + underscores only.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return LINKTREE_HANDLE_REGEX.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

/**
 * Extracts and normalizes the handle from a Linktree URL.
 */
export function extractLinktreeHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!LINKTREE_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    // Normalize: lowercase, strip @ prefix
    const rawHandle = parts[0].replace(/^@/, '').toLowerCase();

    // Validate handle format
    if (!isValidHandle(rawHandle)) {
      return null;
    }

    return rawHandle;
  } catch {
    return null;
  }
}

/**
 * Validates that a URL is a valid Linktree profile URL.
 * Uses shared validation logic from base module.
 */
export function isLinktreeUrl(url: string): boolean {
  if (!isPlatformUrl(url, LINKTREE_CONFIG)) {
    return false;
  }

  // Additional Linktree-specific validation: check handle format
  const handle = extractLinktreeHandle(url);
  return handle !== null && handle.length > 0;
}

/**
 * Validates and normalizes a Linktree URL.
 * Returns null if invalid.
 */
export function validateLinktreeUrl(url: string): string | null {
  const result = validatePlatformUrl(url, LINKTREE_CONFIG);

  if (!result.valid || !result.handle) {
    return null;
  }

  // Additional Linktree-specific validation
  if (!isValidHandle(result.handle)) {
    return null;
  }

  // Return canonical URL format
  return `https://${LINKTREE_CONFIG.canonicalHost}/${result.handle}`;
}
