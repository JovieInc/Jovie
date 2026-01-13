/**
 * Spotify Validation Schemas
 *
 * Zod schemas for validating Spotify-related inputs including:
 * - Artist search queries
 * - Spotify artist IDs
 * - Profile claim operations
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in hot-path API routes.
 *
 * @see https://developer.spotify.com/documentation/web-api
 */

import { z } from 'zod';

// ============================================================================
// Spotify Artist ID Validation
// ============================================================================

/**
 * Spotify IDs are always 22 characters, base62 encoded
 * (alphanumeric: 0-9, A-Z, a-z)
 *
 * @example "4Z8W4fKeB5YxbusRsdQVPb" (Radiohead)
 * @see https://developer.spotify.com/documentation/web-api/concepts/spotify-uris-ids
 */
export const spotifyArtistIdSchema = z
  .string()
  .regex(/^[0-9A-Za-z]{22}$/, 'Invalid Spotify artist ID');

/**
 * Inferred TypeScript type for Spotify artist IDs.
 */
export type SpotifyArtistId = z.infer<typeof spotifyArtistIdSchema>;

// ============================================================================
// Artist Search Validation
// ============================================================================

/**
 * Allowed characters in search queries:
 * - Unicode letters (\p{L}) - supports international characters
 * - Unicode numbers (\p{N})
 * - Whitespace (\s)
 * - Hyphens, apostrophes, quotes, periods, ampersands
 */
const SEARCH_QUERY_REGEX = /^[\p{L}\p{N}\s\-'".&]+$/u;

/**
 * Artist search query validation schema.
 *
 * Security considerations:
 * - Minimum 1 character to prevent empty queries
 * - Maximum 100 characters to prevent DoS via complex parsing
 * - Regex pattern to block injection characters
 * - Trimming to normalize whitespace
 */
export const artistSearchQuerySchema = z
  .string()
  .min(1, 'Search query required')
  .max(100, 'Query too long')
  .regex(SEARCH_QUERY_REGEX, 'Invalid characters in query')
  .transform(s => s.trim());

/**
 * Complete artist search input schema.
 */
export const artistSearchSchema = z.object({
  query: artistSearchQuerySchema,
  limit: z.number().int().min(1).max(10).default(5),
  offset: z.number().int().min(0).max(100).default(0),
});

/**
 * Inferred TypeScript type for artist search input.
 */
export type ArtistSearchInput = z.infer<typeof artistSearchSchema>;

// ============================================================================
// Handle Validation
// ============================================================================

/**
 * Handle validation schema for profile usernames.
 *
 * Constraints:
 * - 3-30 characters
 * - Lowercase letters, numbers, underscores only
 * - Automatically normalized to lowercase
 */
export const handleSchema = z
  .string()
  .min(3, 'Handle must be at least 3 characters')
  .max(30, 'Handle too long')
  .regex(/^[a-z0-9_]+$/, 'Handle: lowercase letters, numbers, underscores only')
  .transform(s => s.toLowerCase());

/**
 * Inferred TypeScript type for handles.
 */
export type Handle = z.infer<typeof handleSchema>;

// ============================================================================
// Profile Claim Validation
// ============================================================================

/**
 * Profile claim input schema.
 *
 * Used when a user claims ownership of a Spotify artist profile.
 */
export const claimProfileSchema = z.object({
  spotifyArtistId: spotifyArtistIdSchema,
  handle: handleSchema,
});

/**
 * Inferred TypeScript type for profile claim input.
 */
export type ClaimProfileInput = z.infer<typeof claimProfileSchema>;

// ============================================================================
// Spotify Data Refresh Validation
// ============================================================================

/**
 * Data refresh request schema.
 *
 * Used when requesting a refresh of artist data from Spotify.
 */
export const refreshArtistDataSchema = z.object({
  artistId: z.string().uuid('Invalid artist ID'),
  force: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for data refresh input.
 */
export type RefreshArtistDataInput = z.infer<typeof refreshArtistDataSchema>;

// ============================================================================
// OAuth State Validation
// ============================================================================

/**
 * OAuth callback parameters schema.
 *
 * Validates the code and state parameters received from Spotify OAuth callback.
 */
export const spotifyOAuthCallbackSchema = z.object({
  code: z.string().min(1).max(500),
  state: z.string().min(1).max(100),
});

/**
 * Inferred TypeScript type for OAuth callback params.
 */
export type SpotifyOAuthCallbackParams = z.infer<
  typeof spotifyOAuthCallbackSchema
>;

// ============================================================================
// Optional Schemas
// ============================================================================

/**
 * Optional Spotify artist ID schema.
 */
export const optionalSpotifyArtistIdSchema = spotifyArtistIdSchema.optional();

/**
 * Optional handle schema.
 */
export const optionalHandleSchema = handleSchema.optional();

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Generic validation result type.
 */
export interface ValidationResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Create a validation function from a Zod schema.
 * Eliminates duplication by providing a generic wrapper for safeParse.
 *
 * @param schema - Zod schema to validate against
 * @returns Validation function that returns a standardized result object
 */
function createValidator<T>(schema: z.ZodSchema<T>) {
  return (value: unknown): ValidationResult<T> => {
    const result = schema.safeParse(value);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.issues[0]?.message };
  };
}

/**
 * Validate a Spotify artist ID.
 *
 * @param id - The ID to validate
 * @returns Object with success status and error message if invalid
 */
export const validateSpotifyArtistId = createValidator(spotifyArtistIdSchema);

/**
 * Validate an artist search query.
 *
 * @param query - The query to validate
 * @returns Object with success status and error message if invalid
 */
export const validateArtistSearchQuery = createValidator(
  artistSearchQuerySchema
);

/**
 * Validate a handle.
 *
 * @param handle - The handle to validate
 * @returns Object with success status and error message if invalid
 */
export const validateHandle = createValidator(handleSchema);
