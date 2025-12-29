import { z } from 'zod';

/**
 * Account validation schemas for account-related API routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in account API endpoints.
 *
 * @see /api/account/email
 */

// =============================================================================
// Email Sync Schemas
// =============================================================================

/**
 * Account email sync validation schema.
 * Used for POST /api/account/email requests to sync email address.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const accountEmailSyncSchema = z.object({
  /** Email address to sync */
  email: z.string().email(),
});

/**
 * Inferred TypeScript type for account email sync payloads.
 */
export type AccountEmailSyncPayload = z.infer<typeof accountEmailSyncSchema>;
