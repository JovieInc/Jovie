import { z } from 'zod';

/**
 * Payment validation schemas for payment-related API routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in payment API endpoints.
 *
 * @see /api/create-tip-intent
 */

// =============================================================================
// Tip Intent Schemas
// =============================================================================

/**
 * Tip intent validation schema.
 * Used for POST /api/create-tip-intent requests to create Stripe PaymentIntents.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const tipIntentSchema = z.object({
  /** Tip amount in dollars (1-500, integer) */
  amount: z.number().int().min(1).max(500),
  /** Creator handle/username */
  handle: z.string(),
});

/**
 * Inferred TypeScript type for tip intent payloads.
 */
export type TipIntentPayload = z.infer<typeof tipIntentSchema>;
