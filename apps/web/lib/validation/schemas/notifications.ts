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

export const verifyEmailOtpSchema = z.object({
  artist_id: uuidSchema,
  email: z.string().email(),
  otp_code: z.string().regex(/^\d{6}$/),
});

export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;

// =============================================================================
// Update Subscriber Name Schema
// =============================================================================

/**
 * Schema for updating a subscriber's name after signup.
 * Identified by artist_id + email (no auth required — fan just subscribed).
 */
export const updateSubscriberNameSchema = z.object({
  artist_id: uuidSchema,
  email: z.string().email(),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long'),
});

export type UpdateSubscriberNameInput = z.infer<
  typeof updateSubscriberNameSchema
>;

// =============================================================================
// Update Subscriber Birthday Schema
// =============================================================================

/**
 * Schema for updating a subscriber's birthday after signup.
 * Identified by artist_id + email (no auth required — fan just subscribed).
 * Birthday stored as YYYY-MM-DD (ISO date); legacy MM-DD also accepted.
 */
export const updateSubscriberBirthdaySchema = z.object({
  artist_id: uuidSchema,
  email: z.string().email().max(254),
  birthday: z
    .string()
    .regex(
      /^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2})$/,
      'Birthday must be in YYYY-MM-DD or MM-DD format'
    )
    .refine(
      value => {
        const parts = value.split('-').map(Number);
        const mm = parts.length === 3 ? parts[1] : parts[0];
        const dd = parts.length === 3 ? parts[2] : parts[1];
        const maxDay = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm];
        return dd <= maxDay;
      },
      { message: 'Invalid day for the given month' }
    ),
});

export type UpdateSubscriberBirthdayInput = z.infer<
  typeof updateSubscriberBirthdaySchema
>;

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

// =============================================================================
// Content Preferences Schema
// =============================================================================

/**
 * Schema for content preference keys.
 * Must match FanNotificationContentType from analytics schema.
 */
export const contentPreferenceKeySchema = z.enum([
  'newMusic',
  'tourDates',
  'merch',
  'general',
]);

/**
 * Schema for updating content notification preferences.
 * Requires artist_id + at least one identifier (email/phone) + partial prefs.
 */
export const updateContentPreferencesSchema = z
  .object({
    artist_id: uuidSchema,
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
    preferences: z.record(contentPreferenceKeySchema, z.boolean()).optional(),
    artist_email_opt_in: z.boolean().optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  )
  .refine(
    data =>
      Boolean(data.preferences && Object.keys(data.preferences).length > 0) ||
      typeof data.artist_email_opt_in === 'boolean',
    'At least one preference change is required'
  );

/**
 * Inferred TypeScript type for content preferences update input.
 */
export type UpdateContentPreferencesInput = z.infer<
  typeof updateContentPreferencesSchema
>;
