import { z } from 'zod';

/**
 * Schema for subscribe requests
 * Validates artist_id (UUID), channel (email/sms), contact info, and source
 */
export const subscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'sms']).default('email'),
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
 * Schema for unsubscribe requests
 * Requires either email, phone, or token for identification
 */
export const unsubscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'sms']).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
    token: z.string().optional(),
    method: z
      .enum(['email_link', 'dashboard', 'api', 'dropdown'])
      .default('api'),
  })
  .superRefine((data, ctx) => {
    const hasToken = Boolean(data.token);
    const hasEmail = Boolean(data.email);
    const hasPhone = Boolean(data.phone);

    if (hasToken || hasEmail || hasPhone) return;

    const path =
      data.channel === 'sms'
        ? ['phone']
        : data.channel === 'email'
          ? ['email']
          : ['channel'];

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either email, phone, or token must be provided.',
      path,
    });
  });

/**
 * Schema for status check requests
 * Requires at least email or phone
 */
export const statusSchema = z
  .object({
    artist_id: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  );

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
