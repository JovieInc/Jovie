/**
 * Beacons URL and Handle Validation
 *
 * Functions for validating and normalizing Beacons.ai URLs and handles.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import {
  normalizeHandle as baseNormalizeHandle,
  isPlatformUrl,
  validatePlatformUrl,
} from '../base';
import { BEACONS_CONFIG, BEACONS_HANDLE_REGEX, RESERVED_PATHS } from './config';

/**
 * Validates a Beacons handle format.
 * Beacons handles allow alphanumeric, underscores, and dots.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }

  const normalized = handle.toLowerCase();

  if (RESERVED_PATHS.has(normalized)) {
    return false;
  }

  return BEACONS_HANDLE_REGEX.test(normalized);
}

/**
 * Normalizes a handle for storage.
 */
export function normalizeHandle(handle: string): string {
  return baseNormalizeHandle(handle);
}

/**
 * Extracts and normalizes the handle from a Beacons.ai URL.
 */
export function extractBeaconsHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!BEACONS_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

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
 * Validates that a URL is a valid Beacons.ai profile URL.
 * Uses shared validation logic from base module.
 */
export function isBeaconsUrl(url: string): boolean {
  if (!isPlatformUrl(url, BEACONS_CONFIG)) {
    return false;
  }

  // Additional Beacons-specific validation: check handle format
  const handle = extractBeaconsHandle(url);
  return handle !== null && handle.length > 0;
}

/**
 * Validates and normalizes a Beacons.ai URL.
 * Returns null if invalid.
 */
export function validateBeaconsUrl(url: string): string | null {
  const result = validatePlatformUrl(url, BEACONS_CONFIG);

  if (!result.valid || !result.handle) {
    return null;
  }

  // Additional Beacons-specific validation
  if (!isValidHandle(result.handle)) {
    return null;
  }

  // Return canonical URL format
  return `https://${BEACONS_CONFIG.canonicalHost}/${result.handle}`;
}
