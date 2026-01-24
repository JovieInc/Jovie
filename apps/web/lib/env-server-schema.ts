import 'server-only';
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

  // Vercel Blob
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

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

  // Revalidation
  REVALIDATE_SECRET: z.string().optional(),

  // Apple Music DSP enrichment
  APPLE_MUSIC_KEY_ID: z.string().optional(),
  APPLE_MUSIC_TEAM_ID: z.string().optional(),
  APPLE_MUSIC_PRIVATE_KEY: z.string().optional(),

  // Mercury (banking metrics)
  MERCURY_API_BASE_URL: z.string().url().optional(),
  MERCURY_API_TOKEN: z.string().optional(),
  MERCURY_API_KEY: z.string().optional(),
  MERCURY_CHECKING_ACCOUNT_ID: z.string().optional(),
  MERCURY_ACCOUNT_ID: z.string().optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Analytics
  ANALYTICS_RETENTION_DAYS: z.string().optional(),
  TRACKING_TOKEN_SECRET: z.string().optional(),
  TRACKING_RATE_LIMIT_CLICKS_PER_HOUR: z.string().optional(),
  TRACKING_RATE_LIMIT_VISITS_PER_HOUR: z.string().optional(),

  // Admin impersonation
  ENABLE_IMPERSONATION: z.string().optional(),
  IMPERSONATION_SECRET: z.string().optional(),

  // Sentry server-side
  SENTRY_DSN: z.string().optional(),

  // Development tools
  JOVIE_DEV_MEMORY_MONITOR: z.string().optional(),
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
  'BLOB_READ_WRITE_TOKEN',
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
  'REVALIDATE_SECRET',
  'APPLE_MUSIC_KEY_ID',
  'APPLE_MUSIC_TEAM_ID',
  'APPLE_MUSIC_PRIVATE_KEY',
  'MERCURY_API_BASE_URL',
  'MERCURY_API_TOKEN',
  'MERCURY_API_KEY',
  'MERCURY_CHECKING_ACCOUNT_ID',
  'MERCURY_ACCOUNT_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ANALYTICS_RETENTION_DAYS',
  'TRACKING_TOKEN_SECRET',
  'TRACKING_RATE_LIMIT_CLICKS_PER_HOUR',
  'TRACKING_RATE_LIMIT_VISITS_PER_HOUR',
  'ENABLE_IMPERSONATION',
  'IMPERSONATION_SECRET',
  'SENTRY_DSN',
  'JOVIE_DEV_MEMORY_MONITOR',
] as const satisfies readonly (keyof z.infer<typeof ServerEnvSchema>)[];
