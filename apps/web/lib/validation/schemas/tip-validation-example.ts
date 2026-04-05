/**
 * Example implementation showing how to apply Zod validation to tip creation API.
 *
 * This file demonstrates best practices for:
 * - Input validation with comprehensive error messages
 * - SQL injection prevention via UUID validation
 * - XSS prevention via message length limits
 * - Stripe integration with validated data
 * - Proper error handling and client responses
 *
 * @example
 * ```typescript
 * // In your API route (e.g., /api/create-tip-intent/route.ts)
 * import { NextRequest, NextResponse } from 'next/server';
 * import { tipCreationSchema } from '@/lib/validation/schemas';
 * import { ZodError } from 'zod';
 *
 * export async function POST(req: NextRequest) {
 *   try {
 *     const body = await req.json();
 *
 *     // Validate request body with Zod
 *     const validatedData = tipCreationSchema.parse(body);
 *
 *     // Now safely use validated data
 *     const { amount, currency, artistId, message, paymentMethodId } = validatedData;
 *
 *     // Create Stripe payment intent with validated data
 *     const paymentIntent = await stripe.paymentIntents.create({
 *       amount: Math.round(amount * 100), // Convert to cents
 *       currency: currency,
 *       metadata: {
 *         artist_id: artistId, // Validated UUID - SQL injection safe
 *         message: message ?? '', // Validated length - XSS safe
 *       },
 *       payment_method: paymentMethodId,
 *     });
 *
 *     return NextResponse.json({
 *       clientSecret: paymentIntent.client_secret,
 *     });
 *   } catch (error) {
 *     if (error instanceof ZodError) {
 *       // Return validation errors to client
 *       return NextResponse.json(
 *         {
 *           error: 'Validation failed',
 *           details: error.errors.map(err => ({
 *             field: err.path.join('.'),
 *             message: err.message,
 *           })),
 *         },
 *         { status: 400 }
 *       );
 *     }
 *
 *     // Handle other errors
 *     console.error('Tip creation error:', error);
 *     return NextResponse.json(
 *       { error: 'Failed to create tip' },
 *       { status: 500 }
 *     );
 *   }
 * }
 * ```
 *
 * @see /lib/validation/schemas/tip.ts
 */

import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import type { TipCreationPayload } from './tip';
import { tipCreationSchema } from './tip';

/**
 * Parse and validate tip creation request body.
 *
 * @param req - Next.js request object
 * @returns Validated tip creation payload
 * @throws {ZodError} If validation fails
 */
export async function validateTipCreationRequest(
  req: NextRequest
): Promise<TipCreationPayload> {
  const body = await req.json();
  return tipCreationSchema.parse(body);
}

/**
 * Format Zod validation errors for API responses.
 *
 * @param error - ZodError instance
 * @returns Formatted error response object
 */
export function formatValidationErrors(error: ZodError<unknown>) {
  return {
    error: 'Validation failed',
    details: error.issues.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  };
}

/**
 * Safe parsing with custom error handling.
 *
 * @param data - Unknown data to validate
 * @returns Result object with success status and data or error
 */
export function safeParseTipCreation(data: unknown) {
  const result = tipCreationSchema.safeParse(data);

  if (!result.success) {
    return {
      success: false as const,
      error: formatValidationErrors(result.error),
    };
  }

  return {
    success: true as const,
    data: result.data,
  };
}
