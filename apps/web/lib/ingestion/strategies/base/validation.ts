/**
 * URL Validation Utilities
 *
 * Functions for validating URLs and platform-specific URL formats.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import { buildCanonicalUrl, extractHandle } from './handle-extractor';
import { isCanonicalHostValid, isValidHost } from './host-validator';
import type { StrategyConfig } from './types';
import { isUrlSafe as checkUrlSafety } from './validation-pipeline';

/**
 * Validates URL safety before processing.
 * Rejects dangerous schemes and protocol-relative URLs.
 *
 * @param url - The URL to validate
 * @returns True if URL is safe to process
 */
export function isUrlSafe(url: string): boolean {
  return checkUrlSafety(url);
}

/**
 * Checks if a URL belongs to a specific platform.
 * Common validation logic used by all ingestion strategies.
 *
 * @param url - The URL to check
 * @param config - Strategy configuration with valid hosts
 * @returns True if URL belongs to the platform
 */
export function isPlatformUrl(url: string, config: StrategyConfig): boolean {
  if (!isUrlSafe(url)) {
    return false;
  }

  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    if (!config.validHosts.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    // Must have a path (handle)
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length > 0;
  } catch {
    return false;
  }
}

/**
 * Helper to construct invalid URL validation result.
 * Eliminates duplication in error return statements.
 */
function createInvalidResult(): {
  valid: false;
  normalized: null;
  handle: null;
} {
  return { valid: false, normalized: null, handle: null };
}

/**
 * Validates that a URL belongs to a specific platform.
 * Uses modular validation pipeline to reduce cognitive complexity.
 */
export function validatePlatformUrl(
  url: string,
  config: StrategyConfig
): { valid: boolean; normalized: string | null; handle: string | null } {
  try {
    const candidate = url.trim();

    // Step 1: Validate URL safety (scheme, protocol-relative, HTTPS)
    if (!checkUrlSafety(candidate)) {
      return createInvalidResult();
    }

    // Step 2: Validate canonical host configuration
    if (!isCanonicalHostValid(config)) {
      return createInvalidResult();
    }

    // Step 3: Normalize and parse URL
    const normalized = normalizeUrl(candidate);
    const parsed = new URL(normalized);

    // Step 4: Validate host against allowed list
    if (!isValidHost(parsed.hostname, config)) {
      return createInvalidResult();
    }

    // Step 5: Extract and validate handle
    const handleResult = extractHandle(parsed.pathname);
    if (!handleResult.success || !handleResult.handle) {
      return createInvalidResult();
    }

    // Step 6: Build canonical URL
    const canonicalUrl = buildCanonicalUrl(
      config.canonicalHost.toLowerCase(),
      handleResult.handle
    );

    return {
      valid: true,
      normalized: canonicalUrl,
      handle: handleResult.handle,
    };
  } catch {
    return createInvalidResult();
  }
}
