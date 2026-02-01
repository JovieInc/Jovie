/**
 * Spotify Environment Validation
 *
 * Validates and exports Spotify-related environment variables.
 * Ensures required credentials are present before using Spotify API.
 *
 * Security:
 * - Server-only module (cannot be imported in client code)
 * - Validates credentials on first use
 * - Provides clear error messages for missing configuration
 */

import 'server-only';
import { z } from 'zod';

// ============================================================================
// Schema Definition
// ============================================================================

/**
 * Spotify environment variable schema.
 * All fields are required for Spotify integration to work.
 */
const SpotifyEnvSchema = z.object({
  SPOTIFY_CLIENT_ID: z
    .string()
    .min(1, 'SPOTIFY_CLIENT_ID is required')
    .regex(
      /^[a-f0-9]{32}$/,
      'SPOTIFY_CLIENT_ID must be a 32-character hex string'
    ),
  SPOTIFY_CLIENT_SECRET: z
    .string()
    .min(1, 'SPOTIFY_CLIENT_SECRET is required')
    .regex(
      /^[a-f0-9]{32}$/,
      'SPOTIFY_CLIENT_SECRET must be a 32-character hex string'
    ),
});

/**
 * Optional Spotify environment variables.
 * These are validated but not required.
 */
const OptionalSpotifyEnvSchema = z.object({
  // OAuth redirect URI (defaults to calculated value)
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),
  // Custom API timeout in milliseconds
  SPOTIFY_API_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .optional(),
});

// ============================================================================
// Types
// ============================================================================

export type SpotifyEnv = z.infer<typeof SpotifyEnvSchema>;
export type OptionalSpotifyEnv = z.infer<typeof OptionalSpotifyEnvSchema>;

export interface SpotifyConfig extends SpotifyEnv, Partial<OptionalSpotifyEnv> {
  isConfigured: boolean;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if Spotify credentials are configured.
 * Does not throw, just returns boolean.
 */
export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Validate Spotify environment and return result.
 */
export function validateSpotifyEnv(): {
  success: boolean;
  data?: SpotifyEnv;
  errors?: string[];
} {
  const result = SpotifyEnvSchema.safeParse({
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map(
        issue => `${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Get validated Spotify configuration.
 * Throws if required environment variables are missing.
 */
export function getSpotifyConfig(): SpotifyConfig {
  if (!isSpotifyConfigured()) {
    return {
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      isConfigured: false,
    };
  }

  const validation = validateSpotifyEnv();

  if (!validation.success) {
    console.error('[Spotify Config] Validation failed:', validation.errors);
    return {
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      isConfigured: false,
    };
  }

  // Parse optional env vars
  const optionalResult = OptionalSpotifyEnvSchema.safeParse({
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
    SPOTIFY_API_TIMEOUT_MS: process.env.SPOTIFY_API_TIMEOUT_MS,
  });

  return {
    ...validation.data!,
    ...(optionalResult.success ? optionalResult.data : {}),
    isConfigured: true,
  };
}

/**
 * Get Spotify credentials, throwing if not configured.
 * Use this when Spotify integration is required.
 */
export function requireSpotifyConfig(): SpotifyEnv {
  const config = getSpotifyConfig();

  if (!config.isConfigured) {
    throw new Error(
      'Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.'
    );
  }

  return {
    SPOTIFY_CLIENT_ID: config.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: config.SPOTIFY_CLIENT_SECRET,
  };
}

// ============================================================================
// Lazy-loaded validated config
// ============================================================================

let _spotifyConfig: SpotifyConfig | null = null;

/**
 * Get cached Spotify configuration.
 * Validates on first access, then caches result.
 */
export function getSpotifyEnv(): SpotifyConfig {
  _spotifyConfig ??= getSpotifyConfig();
  return _spotifyConfig;
}

/**
 * Check Spotify configuration and log status.
 * Call this at application startup.
 */
export function validateSpotifyConfigOnStartup(): void {
  const config = getSpotifyEnv();

  if (config.isConfigured) {
    console.log('[Spotify] Configuration validated successfully');
  } else {
    console.warn(
      '[Spotify] Not configured - Spotify integration will be disabled'
    );

    const validation = validateSpotifyEnv();
    if (!validation.success && validation.errors) {
      console.warn('[Spotify] Configuration issues:', validation.errors);
    }
  }
}

// ============================================================================
// API Configuration Constants
// ============================================================================

/**
 * Spotify API base URL.
 */
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/**
 * Spotify accounts base URL (for OAuth).
 */
export const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

/**
 * Default API timeout in milliseconds.
 */
export const SPOTIFY_DEFAULT_TIMEOUT_MS = 10000;

/**
 * Token refresh buffer in milliseconds.
 * Refresh tokens 5 minutes before expiry.
 */
export const SPOTIFY_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Client credentials token lifetime in milliseconds.
 * Spotify client credentials tokens last 1 hour.
 */
export const SPOTIFY_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
