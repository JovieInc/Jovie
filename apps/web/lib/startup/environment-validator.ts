import {
  getEnvironmentInfo,
  validateAndLogEnvironment,
} from '@/lib/env-server';
import { validateDatabaseUrl } from '@/lib/utils/database-url-validator';

// Track if validation has already run to avoid duplicate checks
let validationCompleted = false;
let validationResult: ReturnType<typeof validateAndLogEnvironment> | null =
  null;

function logEnvironmentInfo() {
  const envInfo = getEnvironmentInfo();
  console.log('[STARTUP] Environment Info:', {
    environment: envInfo.nodeEnv,
    platform: envInfo.platform,
    nodeVersion: envInfo.nodeVersion,
    integrations: {
      database: envInfo.hasDatabase,
      auth: envInfo.hasClerk,
      payments: envInfo.hasStripe,
      images: envInfo.hasCloudinary,
    },
  });
  return envInfo;
}

function logCriticalEnvironmentIssues(
  result: ReturnType<typeof validateAndLogEnvironment>,
  isProduction: boolean
) {
  if (result.critical.length === 0) {
    return false;
  }

  console.error(
    '[STARTUP] CRITICAL: Application cannot start due to missing required environment variables'
  );
  console.error('[STARTUP] Critical issues:', result.critical);

  if (isProduction) {
    console.error('[STARTUP] Exiting due to critical environment issues');
  }

  return true;
}

function logValidationSummary(
  result: ReturnType<typeof validateAndLogEnvironment>
) {
  if (result.valid) {
    console.log('[STARTUP] ✅ Environment validation completed successfully');
    return;
  }

  const totalIssues =
    result.errors.length + result.warnings.length + result.critical.length;
  console.warn(
    `[STARTUP] ⚠️  Environment validation completed with ${totalIssues} issue(s)`
  );
}

/**
 * Run environment validation at application startup
 * This should be called early in the application lifecycle
 */
export async function runStartupEnvironmentValidation() {
  // Avoid duplicate validation
  if (validationCompleted) {
    return validationResult;
  }

  try {
    console.log('[STARTUP] Running environment validation...');

    validationResult = validateAndLogEnvironment('runtime');

    const envInfo = logEnvironmentInfo();
    const isProduction = envInfo.nodeEnv === 'production';
    const hasCriticalIssues = logCriticalEnvironmentIssues(
      validationResult,
      isProduction
    );

    if (hasCriticalIssues && isProduction) {
      validationCompleted = true;
      throw new Error('Critical environment validation failed');
    }

    logValidationSummary(validationResult);

    validationCompleted = true;
    return validationResult;
  } catch (error) {
    console.error('[STARTUP] Environment validation failed:', error);
    validationResult = {
      valid: false,
      errors: ['Environment validation crashed'],
      warnings: [],
      critical: ['Failed to validate environment'],
    };
    validationCompleted = true;
    return validationResult;
  }
}

/**
 * Get the cached validation result
 */
export function getValidationResult() {
  return validationResult;
}

/**
 * Check if validation has completed
 */
export function isValidationCompleted() {
  return validationCompleted;
}

/**
 * Middleware-safe environment validation
 * Lighter version that doesn't log extensively (to avoid middleware overhead)
 */
export function validateEnvironmentForMiddleware(): boolean {
  try {
    // Basic checks for middleware functionality
    const hasRequiredForAuth = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    // Middleware can function with just Clerk, database isn't required for all routes
    return hasRequiredForAuth;
  } catch {
    return false;
  }
}

/**
 * API route environment validation
 * Quick validation for API routes that need specific environment variables
 */
export function validateEnvironmentForApiRoute(requiredVars: string[]): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Database-specific environment validation
 */
export function validateDatabaseEnvironment(): {
  valid: boolean;
  error?: string;
} {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return { valid: false, error: 'DATABASE_URL is not set' };
    }

    // Use shared validation logic
    const validationResult = validateDatabaseUrl(databaseUrl);
    return {
      valid: validationResult.valid,
      error: validationResult.error,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Database environment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
