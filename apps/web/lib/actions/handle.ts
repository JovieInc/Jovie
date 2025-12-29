'use server';

/**
 * Server Actions for Handle Validation
 *
 * This module centralizes handle availability checking to ensure:
 * - Consistent validation logic
 * - Proper security measures (rate limiting, constant-time responses)
 * - No client-side fetching of server data
 *
 * Note: Handle validation is a special case - it requires constant-time
 * responses to prevent timing attacks, which is why we also keep the
 * API route for interactive use cases with debouncing.
 *
 * @see agents.md Section 10.1 - Data Fetching Strategy
 */

import { eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { enforceHandleCheckRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';

export type CheckHandleResult =
  | { success: true; available: boolean }
  | { success: false; error: string };

/**
 * Validate handle format
 */
function validateHandleFormat(handle: string): {
  valid: boolean;
  error?: string;
} {
  if (!handle) {
    return { valid: false, error: 'Handle is required' };
  }

  if (handle.length < 3) {
    return { valid: false, error: 'Handle must be at least 3 characters' };
  }

  if (handle.length > 30) {
    return { valid: false, error: 'Handle must be less than 30 characters' };
  }

  if (!/^[a-zA-Z0-9-]+$/.test(handle)) {
    return {
      valid: false,
      error: 'Handle can only contain letters, numbers, and hyphens',
    };
  }

  return { valid: true };
}

/**
 * Check handle availability via server action
 *
 * This replaces the client-side useHandleApiValidation hook for
 * server-side validation. For interactive client-side validation
 * with debouncing, continue using the API route.
 *
 * Security Note: This action enforces rate limiting per IP address.
 * For timing attack prevention, use the API route which includes
 * constant-time response padding.
 *
 * @param handle - The handle to check
 * @returns Availability status or error response
 *
 * @example
 * // In a Server Action or form handler
 * const result = await checkHandleAvailability('myhandle');
 * if (result.success && result.available) {
 *   // Handle is available
 * }
 */
export async function checkHandleAvailability(
  handle: string
): Promise<CheckHandleResult> {
  noStore();

  // Validate format first
  const validation = validateHandleFormat(handle);
  if (!validation.valid) {
    return { success: false, error: validation.error! };
  }

  try {
    // Rate limiting
    const headersList = await headers();
    const ip = extractClientIP(headersList);
    await enforceHandleCheckRateLimit(ip);

    const handleLower = handle.toLowerCase();

    // Check availability with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 3000);
    });

    const data = await Promise.race([
      db
        .select({ username: creatorProfiles.username })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, handleLower))
        .limit(1),
      timeoutPromise,
    ]);

    return { success: true, available: !data || data.length === 0 };
  } catch (error: unknown) {
    await captureError('Error checking handle availability', error, {
      handle,
      action: 'checkHandleAvailability',
    });

    // Handle rate limiting
    if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
      return { success: false, error: 'Too many requests. Please wait.' };
    }

    // Handle timeout
    if (
      (error as Error)?.message?.includes('timeout') ||
      (error as Error)?.message?.includes('Database timeout')
    ) {
      // For server-side checks, we can't reliably mock - return error
      return { success: false, error: 'Service temporarily unavailable' };
    }

    return { success: false, error: 'Failed to check handle availability' };
  }
}

/**
 * Validate handle and check availability in one call
 *
 * Convenience method that combines format validation and availability check.
 * Use this for form submissions where you need both validations.
 *
 * @param handle - The handle to validate and check
 * @returns Validation and availability result
 */
export async function validateAndCheckHandle(handle: string): Promise<{
  valid: boolean;
  available: boolean;
  error?: string;
}> {
  // Format validation (synchronous)
  const formatValidation = validateHandleFormat(handle);
  if (!formatValidation.valid) {
    return {
      valid: false,
      available: false,
      error: formatValidation.error,
    };
  }

  // Availability check (async)
  const result = await checkHandleAvailability(handle);

  if (!result.success) {
    return {
      valid: true,
      available: false,
      error: result.error,
    };
  }

  return {
    valid: true,
    available: result.available,
    error: result.available ? undefined : 'Handle already taken',
  };
}
