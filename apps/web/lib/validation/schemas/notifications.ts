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

const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 32;
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/; // NOSONAR (S5852) - bounded by EMAIL_MAX_LENGTH before regex use
const CONTROL_OR_SPACE_REGEX = /[\s\p{Cc}]/gu;
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export const NOTIFICATION_CAPTURE_ERROR_MESSAGES = {
  emailRequired: 'Email address is required.',
  emailTooLong: 'Email address must be 254 characters or fewer.',
  emailNoSpaces: 'Email address cannot contain spaces or control characters.',
  emailFormat:
    'Email address must include a local part, @, domain, and top-level domain.',
  phoneRequired: 'Phone number is required.',
  phoneTooLong: 'Phone number must be 32 characters or fewer.',
  phoneFormat: 'Phone number must be a valid US or Canadian number.',
  smsCountry: 'SMS notifications are available in the US and Canada only.',
} as const;

export const notificationCaptureSchema = z
  .object({
    channel: notificationChannelSchema.extract(['email', 'sms']),
    value: z.string(),
    country_code: z
      .string()
      .length(2)
      .regex(/^[a-zA-Z]{2}$/)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'email') {
      const trimmed = data.value.trim();

      if (!trimmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailRequired,
          path: ['value'],
        });
        return;
      }

      if (trimmed.length > EMAIL_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailTooLong,
          path: ['value'],
        });
        return;
      }

      if (CONTROL_OR_SPACE_REGEX.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailNoSpaces,
          path: ['value'],
        });
        return;
      }

      if (!EMAIL_REGEX.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailFormat,
          path: ['value'],
        });
      }
      return;
    }

    const countryCode = data.country_code?.toUpperCase();
    if (countryCode !== 'US' && countryCode !== 'CA') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.smsCountry,
        path: ['country_code'],
      });
      return;
    }

    const trimmed = data.value.trim();
    if (!trimmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneRequired,
        path: ['value'],
      });
      return;
    }

    if (trimmed.length > PHONE_MAX_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneTooLong,
        path: ['value'],
      });
      return;
    }

    if (!E164_PHONE_REGEX.test(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneFormat,
        path: ['value'],
      });
    }
  });

export type NotificationCaptureInput = z.infer<
  typeof notificationCaptureSchema
>;

export function getNotificationCaptureError(
  input: NotificationCaptureInput
): string | null {
  const parsed = notificationCaptureSchema.safeParse(input);
  return parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? 'Invalid notification contact.');
}

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
    source_context: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    const capturePath =
      data.channel === 'email'
        ? 'email'
        : data.country_code?.toUpperCase() !== 'US' &&
            data.country_code?.toUpperCase() !== 'CA'
          ? 'country_code'
          : 'phone';
    const contactError = getNotificationCaptureError({
      channel: data.channel,
      value: data.channel === 'email' ? (data.email ?? '') : (data.phone ?? ''),
      country_code: data.country_code,
    });

    if (!contactError) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: contactError,
      path: [capturePath],
    });
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
// SMS Subscribe Intent Schema (JOV-1834)
// =============================================================================

/**
 * Schema for `POST /api/notifications/sms-intents` — creates a short-lived
 * native SMS subscribe intent. Returns a JOIN code that the fan texts to
 * the Jovie messaging service.
 */
export const smsIntentCreateSchema = z.object({
  artist_id: uuidSchema,
  source: z.string().min(1).max(80).default('profile_bell'),
  source_url: z.string().url().max(2048).optional(),
});

export type SmsIntentCreateInput = z.infer<typeof smsIntentCreateSchema>;

/**
 * Schema for `GET /api/notifications/sms-intents/[id]/status` — body shape
 * not used; the route reads `id` from the URL and `visitor_id` from cookie.
 * This stub keeps the validation surface consistent with other endpoints.
 */
export const smsIntentStatusSchema = z.object({
  intent_id: uuidSchema,
});

export type SmsIntentStatusInput = z.infer<typeof smsIntentStatusSchema>;

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
