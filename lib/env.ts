import { z } from 'zod';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

// Centralized environment validation and access
// Use this module instead of reading process.env throughout the app.

// Custom DATABASE_URL validator using shared validation logic
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

const EnvSchema = z.object({
  // Public client-side envs
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://jov.ie'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: z.string().optional(),

  // Stripe public keys
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Cloudinary configuration
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().optional(),

  // Email / notifications
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),

  // Database configuration (required at runtime, but optional during build)
  DATABASE_URL: databaseUrlValidator,

  // Server or build-time envs (may be undefined locally)
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),

  // Stripe server-side configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Stripe price IDs for introductory pricing
  STRIPE_PRICE_INTRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_INTRO_YEARLY: z.string().optional(),

  // Stripe price IDs for standard pricing (inactive)
  STRIPE_PRICE_STANDARD_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STANDARD_YEARLY: z.string().optional(),
  INGESTION_CRON_SECRET: z.string().optional(),

  // Statsig server-side
  STATSIG_SERVER_API_KEY: z.string().optional(),
});

// Safe-parse to avoid hard crashes in production; surface clear errors in dev.
const rawEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie',
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY,
  STATSIG_SERVER_API_KEY: process.env.STATSIG_SERVER_API_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_UPLOAD_FOLDER: process.env.CLOUDINARY_UPLOAD_FOLDER,
  CLOUDINARY_UPLOAD_PRESET: process.env.CLOUDINARY_UPLOAD_PRESET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  RESEND_REPLY_TO_EMAIL: process.env.RESEND_REPLY_TO_EMAIL,
  DATABASE_URL: process.env.DATABASE_URL,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_INTRO_MONTHLY: process.env.STRIPE_PRICE_INTRO_MONTHLY,
  STRIPE_PRICE_INTRO_YEARLY: process.env.STRIPE_PRICE_INTRO_YEARLY,
  STRIPE_PRICE_STANDARD_MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
  STRIPE_PRICE_STANDARD_YEARLY: process.env.STRIPE_PRICE_STANDARD_YEARLY,
  INGESTION_CRON_SECRET: process.env.INGESTION_CRON_SECRET,
};

const parsed = EnvSchema.safeParse(rawEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  // Log zod issues once in dev to aid setup
  // Do not throw to avoid blocking the entire app; surfaced via env-gated logger in dev/preview

  console.warn('[env] Validation issues:', parsed.error.flatten().fieldErrors);
}

// Export a normalized env object. Optional values may be undefined.
export const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: parsed.success
    ? parsed.data.NEXT_PUBLIC_APP_URL
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie'),
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STATSIG_CLIENT_KEY
    : process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY,
  STATSIG_SERVER_API_KEY: parsed.success
    ? parsed.data.STATSIG_SERVER_API_KEY
    : process.env.STATSIG_SERVER_API_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: parsed.success
    ? parsed.data.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: parsed.success
    ? parsed.data.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    : process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: parsed.success
    ? parsed.data.CLOUDINARY_API_KEY
    : process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: parsed.success
    ? parsed.data.CLOUDINARY_API_SECRET
    : process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_UPLOAD_FOLDER: parsed.success
    ? parsed.data.CLOUDINARY_UPLOAD_FOLDER
    : process.env.CLOUDINARY_UPLOAD_FOLDER,
  CLOUDINARY_UPLOAD_PRESET: parsed.success
    ? parsed.data.CLOUDINARY_UPLOAD_PRESET
    : process.env.CLOUDINARY_UPLOAD_PRESET,
  RESEND_API_KEY: parsed.success
    ? parsed.data.RESEND_API_KEY
    : process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: parsed.success
    ? parsed.data.RESEND_FROM_EMAIL
    : process.env.RESEND_FROM_EMAIL,
  RESEND_REPLY_TO_EMAIL: parsed.success
    ? parsed.data.RESEND_REPLY_TO_EMAIL
    : process.env.RESEND_REPLY_TO_EMAIL,
  DATABASE_URL: parsed.success
    ? parsed.data.DATABASE_URL
    : process.env.DATABASE_URL,
  SPOTIFY_CLIENT_ID: parsed.success
    ? parsed.data.SPOTIFY_CLIENT_ID
    : process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: parsed.success
    ? parsed.data.SPOTIFY_CLIENT_SECRET
    : process.env.SPOTIFY_CLIENT_SECRET,
  STRIPE_SECRET_KEY: parsed.success
    ? parsed.data.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: parsed.success
    ? parsed.data.STRIPE_WEBHOOK_SECRET
    : process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_INTRO_MONTHLY: parsed.success
    ? parsed.data.STRIPE_PRICE_INTRO_MONTHLY
    : process.env.STRIPE_PRICE_INTRO_MONTHLY,
  STRIPE_PRICE_INTRO_YEARLY: parsed.success
    ? parsed.data.STRIPE_PRICE_INTRO_YEARLY
    : process.env.STRIPE_PRICE_INTRO_YEARLY,
  STRIPE_PRICE_STANDARD_MONTHLY: parsed.success
    ? parsed.data.STRIPE_PRICE_STANDARD_MONTHLY
    : process.env.STRIPE_PRICE_STANDARD_MONTHLY,
  STRIPE_PRICE_STANDARD_YEARLY: parsed.success
    ? parsed.data.STRIPE_PRICE_STANDARD_YEARLY
    : process.env.STRIPE_PRICE_STANDARD_YEARLY,
  INGESTION_CRON_SECRET: parsed.success
    ? parsed.data.INGESTION_CRON_SECRET
    : process.env.INGESTION_CRON_SECRET,
} as const;
// Feature flags now handled via Statsig; see lib/statsig/*
// Environment validation utilities
export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  critical: string[];
}

/**
 * Validate environment configuration at startup
 * Returns detailed validation results for different environments
 */
export function validateEnvironment(
  context: 'runtime' | 'build' = 'runtime'
): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const critical: string[] = [];

  // Re-run the schema validation to get fresh errors
  const result = EnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;

    Object.entries(fieldErrors).forEach(([field, fieldErrors]) => {
      if (fieldErrors) {
        fieldErrors.forEach(error => {
          if (field === 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') {
            critical.push(`${field}: ${error}`);
          } else if (field === 'DATABASE_URL' && context === 'runtime') {
            critical.push(`${field}: ${error}`);
          } else {
            warnings.push(`${field}: ${error}`);
          }
        });
      }
    });
  }

  // Additional runtime-specific validations
  if (context === 'runtime') {
    // Check for critical runtime dependencies
    if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      critical.push(
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for authentication'
      );
    }

    if (!env.DATABASE_URL) {
      critical.push('DATABASE_URL is required for database operations');
    }

    // Validate specific formats
    if (
      env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_')
    ) {
      errors.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY should start with pk_');
    }

    if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      errors.push('STRIPE_SECRET_KEY should start with sk_');
    }

    if (
      env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_')
    ) {
      errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY should start with pk_');
    }

    // Check for missing environment pairs
    const hasStripePublic = !!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const hasStripeSecret = !!env.STRIPE_SECRET_KEY;

    if (hasStripePublic && !hasStripeSecret) {
      warnings.push(
        'STRIPE_SECRET_KEY is missing but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set'
      );
    }
    if (hasStripeSecret && !hasStripePublic) {
      warnings.push(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing but STRIPE_SECRET_KEY is set'
      );
    }

    // Check for Cloudinary configuration consistency
    const cloudinaryKeys = [
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
      env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    ];
    const cloudinaryKeysPresent = cloudinaryKeys.filter(Boolean).length;

    if (cloudinaryKeysPresent > 0 && cloudinaryKeysPresent < 3) {
      warnings.push(
        'Incomplete Cloudinary configuration - need all of API_KEY, API_SECRET, and CLOUD_NAME'
      );
    }
  }

  return {
    valid: critical.length === 0 && errors.length === 0,
    errors,
    warnings,
    critical,
  };
}

/**
 * Get environment information for debugging
 * Note: Some properties (platform, nodeVersion) are only available in Node.js runtime
 */
export function getEnvironmentInfo() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  // These are Node.js-only APIs, not available in Edge runtime
  // We cast to any to avoid static analysis errors during build
  let platform = 'edge';
  let nodeVersion = 'edge-runtime';

  if (typeof process !== 'undefined' && !process.env.NEXT_RUNTIME) {
    // Only access these if we are likely in a Node environment (NEXT_RUNTIME is undefined or 'nodejs')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = process as any;
    if (p.platform) platform = p.platform;
    if (p.version) nodeVersion = p.version;
  }

  return {
    nodeEnv,
    isProduction,
    isDevelopment,
    isTest,
    platform,
    nodeVersion,
    hasDatabase: !!env.DATABASE_URL,
    hasClerk: !!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    hasStripe: !!(
      env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ),
    hasCloudinary: !!(
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET &&
      env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    ),
  };
}

/**
 * Validate and log environment at startup
 * Call this in your application startup code
 */
export function validateAndLogEnvironment(
  context: 'runtime' | 'build' = 'runtime'
) {
  const validation = validateEnvironment(context);
  const info = getEnvironmentInfo();

  console.log(
    `[ENV] Environment: ${info.nodeEnv} | Platform: ${info.platform} | Node: ${info.nodeVersion}`
  );

  if (validation.critical.length > 0) {
    console.error('[ENV] CRITICAL ISSUES:');
    validation.critical.forEach(issue => console.error(`  ❌ ${issue}`));
  }

  if (validation.errors.length > 0) {
    console.error('[ENV] ERRORS:');
    validation.errors.forEach(error => console.error(`  🔴 ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.warn('[ENV] WARNINGS:');
    validation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
  }

  if (validation.valid) {
    console.log(
      `[ENV] ✅ Environment validation passed for ${context} context`
    );
  } else {
    const errorCount = validation.critical.length + validation.errors.length;
    console.error(
      `[ENV] ❌ Environment validation failed with ${errorCount} error(s)`
    );

    if (context === 'runtime' && validation.critical.length > 0) {
      console.error(
        '[ENV] Application may not function correctly due to critical missing environment variables'
      );
    }
  }

  return validation;
}
