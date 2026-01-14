/**
 * URL Validation Utilities
 *
 * Functions for validating URLs and platform-specific URL formats.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { StrategyConfig } from './types';
import { isValidHandle } from './utils';

/**
 * Validates URL safety before processing.
 * Rejects dangerous schemes and protocol-relative URLs.
 *
 * @param url - The URL to validate
 * @returns True if URL is safe to process
 */
export function isUrlSafe(url: string): boolean {
  const candidate = url.trim();

  // Reject dangerous or unsupported schemes early
  if (/^(javascript|data|vbscript|file|ftp):/i.test(candidate)) {
    return false;
  }

  // Reject protocol-relative URLs to avoid inheriting caller context
  if (candidate.startsWith('//')) {
    return false;
  }

  // Check original URL protocol - require HTTPS
  try {
    const parsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
 */
export function validatePlatformUrl(
  url: string,
  config: StrategyConfig
): { valid: boolean; normalized: string | null; handle: string | null } {
  try {
    const candidate = url.trim();
    const canonicalHost = config.canonicalHost.toLowerCase();

    // Reject dangerous or unsupported schemes early
    if (/^(javascript|data|vbscript|file|ftp):/i.test(candidate)) {
      return createInvalidResult();
    }

    // Reject protocol-relative URLs to avoid inheriting caller context
    if (candidate.startsWith('//')) {
      return createInvalidResult();
    }

    // Check original URL protocol before normalization (normalizeUrl converts http to https)
    const originalParsed = new URL(
      candidate.startsWith('http') ? candidate : `https://${candidate}`
    );
    if (originalParsed.protocol !== 'https:') {
      return createInvalidResult();
    }

    const normalized = normalizeUrl(candidate);
    const parsed = new URL(normalized);

    // Must be HTTPS (after normalization, should always be true if original was https)
    if (parsed.protocol !== 'https:') {
      return createInvalidResult();
    }

    // Ensure canonical host is an allowed host to avoid misconfiguration
    if (!config.validHosts.has(canonicalHost)) {
      return createInvalidResult();
    }

    // Must be a valid host
    if (!config.validHosts.has(parsed.hostname.toLowerCase())) {
      return createInvalidResult();
    }

    // Extract handle from path
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return createInvalidResult();
    }

    const rawHandle = parts[0].replace(/^@/, '').toLowerCase();
    if (!isValidHandle(rawHandle)) {
      return createInvalidResult();
    }

    return {
      valid: true,
      normalized: `https://${canonicalHost}/${rawHandle}`,
      handle: rawHandle,
    };
  } catch {
    return createInvalidResult();
  }
}
