import 'server-only';
import { z } from 'zod';
import { publicEnv } from '@/lib/env-public';
import { ENV_KEYS, ServerEnvSchema } from './env-server-schema';
import { RUNTIME_VALIDATION_RULES } from './env-validation-rules';

// Server-side environment variables
// This module must never be imported in client-side code.
// The `server-only` import above enforces that constraint at build time.

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
 * Process schema validation errors into categorized issues
 */
function processSchemaErrors(
  result: ReturnType<typeof ServerEnvSchema.safeParse>,
  context: 'runtime' | 'build'
): Pick<EnvironmentValidationResult, 'warnings' | 'critical'> {
  const warnings: string[] = [];
  const critical: string[] = [];

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;

    Object.entries(fieldErrors).forEach(([field, errors]) => {
      if (errors) {
        errors.forEach((error: string) => {
          const message = `${field}: ${error}`;
          if (field === 'DATABASE_URL' && context === 'runtime') {
            critical.push(message);
          } else {
            warnings.push(message);
          }
        });
      }
    });
  }

  return { warnings, critical };
}

/**
 * Run runtime validation rules and categorize issues
 */
function runRuntimeValidations(
  env: Record<keyof z.infer<typeof ServerEnvSchema>, string | undefined>
): Pick<EnvironmentValidationResult, 'errors' | 'warnings' | 'critical'> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const critical: string[] = [];

  const vercelEnv =
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

  // Run all validation rules and categorize results
  RUNTIME_VALIDATION_RULES.forEach(rule => {
    const issue = rule({ server: env, vercelEnv });
    if (issue) {
      switch (issue.type) {
        case 'error':
          errors.push(issue.message);
          break;
        case 'warning':
          warnings.push(issue.message);
          break;
        case 'critical':
          critical.push(issue.message);
          break;
      }
    }
  });

  return { errors, warnings, critical };
}

/**
 * Validate environment configuration at startup
 * Returns detailed validation results for different environments
 */
export function validateEnvironment(
  context: 'runtime' | 'build' = 'runtime'
): EnvironmentValidationResult {
  const result = ServerEnvSchema.safeParse(rawServerEnv);
  const schemaIssues = processSchemaErrors(result, context);

  if (context === 'runtime') {
    const runtimeIssues = runRuntimeValidations(env);
    return {
      valid:
        runtimeIssues.critical.length === 0 &&
        runtimeIssues.errors.length === 0,
      errors: runtimeIssues.errors,
      warnings: [...schemaIssues.warnings, ...runtimeIssues.warnings],
      critical: [...schemaIssues.critical, ...runtimeIssues.critical],
    };
  }

  return {
    valid: schemaIssues.critical.length === 0,
    errors: [],
    warnings: schemaIssues.warnings,
    critical: schemaIssues.critical,
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
