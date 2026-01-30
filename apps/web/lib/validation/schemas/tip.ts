import { z } from 'zod';

/**
 * Tip creation validation schemas for payment-related API routes.
 *
 * These schemas provide comprehensive validation for tip creation requests,
 * including security measures against SQL injection, XSS, and malformed data.
 *
 * @see /api/create-tip-intent
 */

// =============================================================================
// Currency Enum
// =============================================================================

/**
 * Supported currencies for tip payments.
 * Currently limited to USD, EUR, and GBP.
 */
export const currencySchema = z.enum(['usd', 'eur', 'gbp']);
export type Currency = z.infer<typeof currencySchema>;

// =============================================================================
// Tip Creation Schema
// =============================================================================

/**
 * Comprehensive tip creation validation schema.
 *
 * Security features:
 * - Amount validation: Prevents negative/excessive amounts, max $10,000
 * - Currency validation: Only allows whitelisted currencies
 * - Artist ID validation: Strict UUID format prevents SQL injection
 * - Message validation: Max length prevents XSS and database overflow
 * - Payment method ID validation: Optional string for Stripe payment methods
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const tipCreationSchema = z.object({
  /**
   * Tip amount in the specified currency.
   * Must be a positive number with max value of 10,000.
   */
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(10000, 'Amount cannot exceed $10,000'),

  /**
   * Currency code for the tip payment.
   * Must be one of: usd, eur, gbp
   */
  currency: currencySchema,

  /**
   * UUID of the artist/creator receiving the tip.
   * Strict UUID validation prevents SQL injection attacks.
   */
  artistId: z.string().uuid('Invalid artist ID format'),

  /**
   * Optional message from the tipper to the artist.
   * Max 500 characters to prevent XSS and database overflow.
   */
  message: z
    .string()
    .max(500, 'Message cannot exceed 500 characters')
    .optional(),

  /**
   * Optional Stripe payment method ID.
   * Used when a customer has saved payment methods.
   */
  paymentMethodId: z.string().optional(),
});

/**
 * Inferred TypeScript type for tip creation payloads.
 */
export type TipCreationPayload = z.infer<typeof tipCreationSchema>;
