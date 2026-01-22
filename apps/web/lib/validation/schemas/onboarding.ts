import { z } from 'zod';

/**
 * Onboarding validation schemas for user registration and profile setup.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in onboarding flows.
 */

// =============================================================================
// Handle Schema
// =============================================================================

/**
 * Handle validation schema.
 * Validates user handles (usernames) with strict format requirements.
 *
 * Requirements:
 * - 3-24 characters long
 * - Only lowercase letters, numbers, and hyphens allowed
 */
export const handleSchema = z
  .string()
  .min(3, { message: 'Must be at least 3 characters' })
  .max(24, { message: 'Must be no more than 24 characters' })
  .regex(/^[a-z0-9-]+$/, {
    message: 'Only lowercase letters, numbers, and hyphens are allowed',
  });

// =============================================================================
// Full Name Schema
// =============================================================================

/**
 * Full name validation schema.
 * Validates display names with support for international characters.
 *
 * Requirements:
 * - 1-50 characters long
 * - Only letters (including Unicode), numbers, spaces, hyphens, apostrophes, and periods allowed
 */
export const fullNameSchema = z
  .string()
  .min(1, { message: 'Full name is required' })
  .max(50, { message: 'Must be no more than 50 characters' })
  .regex(/^[\p{L}0-9\s\-'.]+$/u, {
    message:
      'Only letters, numbers, spaces, hyphens, apostrophes, and periods are allowed',
  });

// =============================================================================
// Onboarding Schema
// =============================================================================

/**
 * Onboarding form validation schema.
 * Used for validating user profile setup during registration.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const onboardingSchema = z.object({
  /** User handle (username) */
  handle: handleSchema,
  /** User's display name */
  fullName: fullNameSchema,
});

/**
 * Inferred TypeScript type for onboarding form values.
 */
export type OnboardingValues = z.infer<typeof onboardingSchema>;
