import 'server-only';
import { z } from 'zod';
import { publicEnv } from '@/lib/env-public';
import { createScopedLogger } from '@/lib/utils/logger';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

const log = createScopedLogger('EnvServer');

// Server-side environment variables
// This module must never be imported in client-side code.
// The `server-only` import above enforces that constraint at build time.

// Custom DATABASE_URL validator using shared validation logic
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

const ServerEnvSchema = z.object({
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
});

const rawServerEnv = {
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
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
  URL_ENCRYPTION_KEY: process.env.URL_ENCRYPTION_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
};

const parsed = ServerEnvSchema.safeParse(rawServerEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  log.warn('Validation issues', {
    fieldErrors: parsed.error.flatten().fieldErrors,
  });
}

// Export server-side environment variables only
export const env = {
  CLERK_SECRET_KEY: parsed.success
    ? parsed.data.CLERK_SECRET_KEY
    : process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SECRET: parsed.success
    ? parsed.data.CLERK_WEBHOOK_SECRET
    : process.env.CLERK_WEBHOOK_SECRET,
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
  URL_ENCRYPTION_KEY: parsed.success
    ? parsed.data.URL_ENCRYPTION_KEY
    : process.env.URL_ENCRYPTION_KEY,
  CRON_SECRET: parsed.success
    ? parsed.data.CRON_SECRET
    : process.env.CRON_SECRET,
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
          if (field === 'DATABASE_URL' && context === 'runtime') {
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
    if (!publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      critical.push(
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for authentication'
      );
    }

    if (!env.DATABASE_URL) {
      critical.push('DATABASE_URL is required for database operations');
    }

    // Validate specific formats
    if (
      publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      !publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_')
    ) {
      errors.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY should start with pk_');
    }

    if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      errors.push('STRIPE_SECRET_KEY should start with sk_');
    }

    if (
      publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_')
    ) {
      errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY should start with pk_');
    }

    // Check for missing environment pairs
    const hasStripePublic = !!publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
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
      publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    ];
    const cloudinaryKeysPresent = cloudinaryKeys.filter(Boolean).length;

    if (cloudinaryKeysPresent > 0 && cloudinaryKeysPresent < 3) {
      warnings.push(
        'Incomplete Cloudinary configuration - need all of API_KEY, API_SECRET, and CLOUD_NAME'
      );
    }

    // Check for URL encryption key in production/preview
    const vercelEnv =
      process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    if (vercelEnv === 'production' || vercelEnv === 'preview') {
      if (!env.URL_ENCRYPTION_KEY) {
        critical.push(
          'URL_ENCRYPTION_KEY is required in production/preview for secure link wrapping. Generate with: openssl rand -base64 32'
        );
      } else if (
        env.URL_ENCRYPTION_KEY === 'default-key-change-in-production-32-chars'
      ) {
        critical.push(
          'URL_ENCRYPTION_KEY is using the default value. Generate a secure key with: openssl rand -base64 32'
        );
      }
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
    hasClerk: !!publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    hasStripe: !!(
      env.STRIPE_SECRET_KEY && publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ),
    hasCloudinary: !!(
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET &&
      publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
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

  // Log environment info at startup (alwaysLog to ensure visibility in all environments)
  log.info(
    `Environment: ${info.nodeEnv} | Platform: ${info.platform} | Node: ${info.nodeVersion}`,
    {
      nodeEnv: info.nodeEnv,
      platform: info.platform,
      nodeVersion: info.nodeVersion,
    },
    { alwaysLog: true }
  );

  if (validation.critical.length > 0) {
    log.error('CRITICAL ISSUES', { issues: validation.critical });
  }

  if (validation.errors.length > 0) {
    log.error('ERRORS', { errors: validation.errors });
  }

  if (validation.warnings.length > 0) {
    log.warn('WARNINGS', { warnings: validation.warnings });
  }

  if (validation.valid) {
    log.info(
      `Environment validation passed for ${context} context`,
      { context, valid: true },
      { alwaysLog: true }
    );
  } else {
    const errorCount = validation.critical.length + validation.errors.length;
    log.error(`Environment validation failed with ${errorCount} error(s)`, {
      context,
      errorCount,
      critical: validation.critical,
      errors: validation.errors,
    });

    if (context === 'runtime' && validation.critical.length > 0) {
      log.error(
        'Application may not function correctly due to critical missing environment variables',
        { criticalIssues: validation.critical }
      );

      // Fail-fast in production/preview environments
      const vercelEnv =
        process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
      if (vercelEnv === 'production' || vercelEnv === 'preview') {
        log.error(
          'FATAL: Cannot start application with critical environment validation errors in production/preview',
          { environment: vercelEnv, criticalIssues: validation.critical }
        );
        throw new Error(
          'Environment validation failed with critical errors. Application cannot start in production/preview without required environment variables.'
        );
      }
    }
  }

  return validation;
}
