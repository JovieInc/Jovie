/**
 * Bandsintown Environment Configuration
 *
 * Validates and exports Bandsintown-related environment variables.
 */

import 'server-only';
import { env } from '@/lib/env-server';

// ============================================================================
// Constants
// ============================================================================

/**
 * Bandsintown API base URL
 */
export const BANDSINTOWN_API_BASE = 'https://rest.bandsintown.com';

/**
 * Default API timeout in milliseconds
 */
export const BANDSINTOWN_DEFAULT_TIMEOUT_MS = 10_000;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Check if Bandsintown is configured.
 */
export function isBandsintownConfigured(): boolean {
  return !!env.BANDSINTOWN_APP_ID;
}

/**
 * Get Bandsintown app ID.
 * Returns empty string if not configured.
 */
export function getBandsintownAppId(): string {
  return env.BANDSINTOWN_APP_ID ?? '';
}

/**
 * Get Bandsintown configuration with availability check.
 * Supports user-provided API key with fallback to environment variable.
 */
export function getBandsintownConfig(userApiKey?: string | null): {
  appId: string;
  isConfigured: boolean;
  source: 'user' | 'env' | 'none';
} {
  // Prefer user-provided API key (trimmed to avoid whitespace issues)
  const trimmedUserKey = userApiKey?.trim();
  if (trimmedUserKey) {
    return { appId: trimmedUserKey, isConfigured: true, source: 'user' };
  }

  // Fallback to environment variable
  const envAppId = getBandsintownAppId();
  if (envAppId) {
    return { appId: envAppId, isConfigured: true, source: 'env' };
  }

  return { appId: '', isConfigured: false, source: 'none' };
}
