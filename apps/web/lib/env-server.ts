import 'server-only';
import { z } from 'zod';
import { publicEnv } from '@/lib/env-public';
import {
  getDatabaseUrlErrorMessage,
  isDatabaseUrlValid,
} from './utils/database-url-validator';

// Server-side environment variables
// This module must never be imported in client-side code.
// The `server-only` import above enforces that constraint at build time.

// Custom DATABASE_URL validator using shared validation logic
const databaseUrlValidator = z.string().optional().refine(isDatabaseUrlValid, {
  message: getDatabaseUrlErrorMessage(),
});

const ServerEnvSchema = z.object({
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
const ENV_KEYS = [
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

/**
 * Extract environment variables from process.env based on ENV_KEYS.
 * Eliminates duplication by programmatically building the object.
 */
const rawServerEnv = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]])
) as Record<keyof z.infer<typeof ServerEnvSchema>, string | undefined>;

const parsed = ServerEnvSchema.safeParse(rawServerEnv);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  console.warn(
    '[env-server] Validation issues:',
    parsed.error.flatten().fieldErrors
  );
}

/**
 * Build environment object with fallback to process.env on validation failure.
 * Eliminates duplication by programmatically constructing the export object.
 */
export const env = Object.fromEntries(
  ENV_KEYS.map(key => [
    key,
    parsed.success ? parsed.data[key] : process.env[key],
  ])
) as Record<keyof z.infer<typeof ServerEnvSchema>, string | undefined>;

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
  let platform = 'edge';
  let nodeVersion = 'edge-runtime';

  if (typeof process !== 'undefined' && !process.env.NEXT_RUNTIME) {
    // Only access these if we are likely in a Node environment (NEXT_RUNTIME is undefined or 'nodejs')
    // Type-safe access to Node.js-only process properties
    const p = process as unknown as { platform?: string; version?: string };
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

      // Fail-fast in production/preview environments
      const vercelEnv =
        process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
      if (vercelEnv === 'production' || vercelEnv === 'preview') {
        console.error(
          '[ENV] FATAL: Cannot start application with critical environment validation errors in production/preview'
        );
        console.error('[ENV] Please fix the following critical issues:');
        validation.critical.forEach(issue => console.error(`  - ${issue}`));
        throw new Error(
          'Environment validation failed with critical errors. Application cannot start in production/preview without required environment variables.'
        );
      }
    }
  }

  return validation;
}

/**
 * Check if running in a secure environment (production or preview)
 * Use this for security-sensitive decisions like cookie flags, encryption requirements, etc.
 */
export function isSecureEnv(): boolean {
  const vercelEnv = env.VERCEL_ENV || env.NODE_ENV || 'development';
  return vercelEnv === 'production' || vercelEnv === 'preview';
}

/**
 * Check if running in a test environment
 */
export function isTestEnv(): boolean {
  return env.NODE_ENV === 'test' || env.VITEST === 'true';
}
