import { z } from 'zod';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

/**
 * Custom DATABASE_URL validator using shared validation logic
 */
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

/**
 * Server-side environment variables schema
 */
export const ServerEnvSchema = z.object({
  // Runtime environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),
  VITEST: z.string().optional(),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),

  // Clerk server-side configuration
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // Cloudinary configuration
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().optional(),

  // Email / notifications
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // Database configuration (required at runtime, but optional during build)
  DATABASE_URL: databaseUrlValidator,

  // Server or build-time envs (may be undefined locally)
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),

  // Stripe server-side configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_TIP_WEBHOOK_SECRET: z.string().optional(),

  // Stripe price IDs for introductory pricing
  STRIPE_PRICE_INTRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_INTRO_YEARLY: z.string().optional(),

  // Stripe price IDs for standard pricing (inactive)
  STRIPE_PRICE_STANDARD_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STANDARD_YEARLY: z.string().optional(),
  INGESTION_CRON_SECRET: z.string().optional(),

  // Statsig server-side
  STATSIG_SERVER_API_KEY: z.string().optional(),

  // URL encryption (required in production/preview)
  URL_ENCRYPTION_KEY: z.string().optional(),

  // Cron job authentication
  CRON_SECRET: z.string().optional(),

  // Security keys
  METADATA_HASH_KEY: z.string().optional(),
  CONTACT_OBFUSCATION_KEY: z.string().optional(),
  PII_ENCRYPTION_KEY: z.string().optional(),

  // HUD (internal kiosk display)
  HUD_KIOSK_TOKEN: z.string().optional(),
  HUD_STARTUP_NAME: z.string().optional(),
  HUD_STARTUP_LOGO_URL: z.string().url().optional(),
  HUD_GITHUB_TOKEN: z.string().optional(),
  HUD_GITHUB_OWNER: z.string().optional(),
  HUD_GITHUB_REPO: z.string().optional(),
  HUD_GITHUB_WORKFLOW: z.string().optional(),
});

/**
 * List of environment variable keys to extract from process.env.
 * Single source of truth for server environment configuration.
 */
export const ENV_KEYS = [
  'NODE_ENV',
  'VITEST',
  'VERCEL_ENV',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_UPLOAD_FOLDER',
  'CLOUDINARY_UPLOAD_PRESET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_REPLY_TO_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'DATABASE_URL',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_TIP_WEBHOOK_SECRET',
  'STRIPE_PRICE_INTRO_MONTHLY',
  'STRIPE_PRICE_INTRO_YEARLY',
  'STRIPE_PRICE_STANDARD_MONTHLY',
  'STRIPE_PRICE_STANDARD_YEARLY',
  'INGESTION_CRON_SECRET',
  'STATSIG_SERVER_API_KEY',
  'URL_ENCRYPTION_KEY',
  'CRON_SECRET',
  'METADATA_HASH_KEY',
  'CONTACT_OBFUSCATION_KEY',
  'PII_ENCRYPTION_KEY',
  'HUD_KIOSK_TOKEN',
  'HUD_STARTUP_NAME',
  'HUD_STARTUP_LOGO_URL',
  'HUD_GITHUB_TOKEN',
  'HUD_GITHUB_OWNER',
  'HUD_GITHUB_REPO',
  'HUD_GITHUB_WORKFLOW',
] as const;
