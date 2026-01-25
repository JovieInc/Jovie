/**
 * Bandsintown Environment Configuration
 *
 * Validates and exports Bandsintown-related environment variables.
 */

import 'server-only';
import { env } from '@/lib/env';

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
 */
export function getBandsintownConfig(): {
  appId: string;
  isConfigured: boolean;
} {
  const appId = getBandsintownAppId();
  return {
    appId,
    isConfigured: !!appId,
  };
}
