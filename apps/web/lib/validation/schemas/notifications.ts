import { z } from 'zod';

import { uuidSchema } from './base';

/**
 * Notification validation schemas for subscriber management.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in API routes.
 *
 * @module @/lib/validation/schemas/notifications
 */

// =============================================================================
// Notification Channel Type
// =============================================================================

/**
 * Notification channel schema.
 * Validates notification delivery method (email or sms).
 */
export const notificationChannelSchema = z.enum(['email', 'sms']);

/**
 * Inferred TypeScript type for notification channels.
 */
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

// =============================================================================
// Notification Unsubscribe Method Type
// =============================================================================

/**
 * Unsubscribe method schema.
 * Tracks how the user initiated the unsubscribe.
 */
export const unsubscribeMethodSchema = z.enum([
  'email_link',
  'dashboard',
  'api',
  'dropdown',
]);

/**
 * Inferred TypeScript type for unsubscribe methods.
 */
export type UnsubscribeMethod = z.infer<typeof unsubscribeMethodSchema>;

// =============================================================================
// Subscribe Schema
// =============================================================================

/**
 * Schema for subscribe requests.
 * Validates artist_id (UUID), channel (email/sms), contact info, and source.
 *
 * Conditional validation:
 * - If channel is 'email', email field is required
 * - If channel is 'sms', phone field is required
 */
export const subscribeSchema = z
  .object({
    artist_id: uuidSchema,
    channel: notificationChannelSchema.default('email'),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
    country_code: z
      .string()
      .length(2)
      .regex(/^[a-zA-Z]{2}$/)
      .optional(),
    city: z.string().max(120).optional(),
    source: z.string().min(1).max(80).default('profile_bell'),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'email' && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required for email notifications.',
        path: ['email'],
      });
    }

    if (data.channel === 'sms' && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone number is required for SMS notifications.',
        path: ['phone'],
      });
    }
  });

/**
 * Inferred TypeScript type for subscribe input.
 */
export type SubscribeInput = z.infer<typeof subscribeSchema>;

// =============================================================================
// Unsubscribe Schema
// =============================================================================

/**
 * Schema for unsubscribe requests.
 * Requires either email, phone, or token for identification.
 *
 * Validation rules:
 * - At least one of email, phone, or token must be provided
 * - Error path is determined by the channel type
 */
export const unsubscribeSchema = z
  .object({
    artist_id: uuidSchema,
    channel: notificationChannelSchema.optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
    token: z.string().optional(),
    method: unsubscribeMethodSchema.default('api'),
  })
  .superRefine((data, ctx) => {
    const hasToken = Boolean(data.token);
    const hasEmail = Boolean(data.email);
    const hasPhone = Boolean(data.phone);

    if (hasToken || hasEmail || hasPhone) return;

    const path = (() => {
      if (data.channel === 'sms') return ['phone'];
      if (data.channel === 'email') return ['email'];
      return ['channel'];
    })();

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either email, phone, or token must be provided.',
      path,
    });
  });

/**
 * Inferred TypeScript type for unsubscribe input.
 */
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

// =============================================================================
// Status Schema
// =============================================================================

/**
 * Schema for status check requests.
 * Requires at least email or phone to look up subscription status.
 */
export const statusSchema = z
  .object({
    artist_id: uuidSchema,
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  );

/**
 * Inferred TypeScript type for status check input.
 */
export type StatusInput = z.infer<typeof statusSchema>;
