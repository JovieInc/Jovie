import 'server-only';
import { z } from 'zod';
import { publicEnv } from './env.public';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

// Server-side environment variables
// This file should NEVER be imported in client-side code
// The 'server-only' import at the top will cause a build error if accidentally imported client-side

// Custom DATABASE_URL validator using shared validation logic
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

const ServerEnvSchema = z.object({
  // Cloudinary configuration
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
});

const rawServerEnv = {
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
  STRIPE_TIP_WEBHOOK_SECRET: process.env.STRIPE_TIP_WEBHOOK_SECRET,
  STRIPE_PRICE_INTRO_MONTHLY: process.env.STRIPE_PRICE_INTRO_MONTHLY,
  STRIPE_PRICE_INTRO_YEARLY: process.env.STRIPE_PRICE_INTRO_YEARLY,
  STRIPE_PRICE_STANDARD_MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
  STRIPE_PRICE_STANDARD_YEARLY: process.env.STRIPE_PRICE_STANDARD_YEARLY,
  INGESTION_CRON_SECRET: process.env.INGESTION_CRON_SECRET,
  STATSIG_SERVER_API_KEY: process.env.STATSIG_SERVER_API_KEY,
};

const parsed = ServerEnvSchema.safeParse(rawServerEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  console.warn(
    '[env.server] Validation issues:',
    parsed.error.flatten().fieldErrors
  );
}

// Export server-side environment variables
const serverEnv = {
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
  STRIPE_TIP_WEBHOOK_SECRET: parsed.success
    ? parsed.data.STRIPE_TIP_WEBHOOK_SECRET
    : process.env.STRIPE_TIP_WEBHOOK_SECRET,
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
  STATSIG_SERVER_API_KEY: parsed.success
    ? parsed.data.STATSIG_SERVER_API_KEY
    : process.env.STATSIG_SERVER_API_KEY,
} as const;

// Combined env object for server-side use (includes both public and server-only)
export const env = {
  ...publicEnv,
  ...serverEnv,
} as const;

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
  const result = ServerEnvSchema.safeParse(rawServerEnv);

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
