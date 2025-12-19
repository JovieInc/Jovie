import { validateDbConnection } from '@/lib/db';
import {
  getEnvironmentInfo,
  validateAndLogEnvironment,
} from '@/lib/env-server';
import { validateDatabaseUrl } from '@/lib/utils/database-url-validator';

// Track if validation has already run to avoid duplicate checks
let validationCompleted = false;
let validationResult: ReturnType<typeof validateAndLogEnvironment> | null =
  null;

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

    // Run the validation
    validationResult = validateAndLogEnvironment('runtime');

    // Log additional startup information
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

    // Handle critical failures
    if (validationResult.critical.length > 0) {
      console.error(
        '[STARTUP] CRITICAL: Application cannot start due to missing required environment variables'
      );
      console.error('[STARTUP] Critical issues:', validationResult.critical);

      // In production, we might want to exit or throw an error
      // In development, we'll continue with warnings
      if (process.env.NODE_ENV === 'production') {
        console.error('[STARTUP] Exiting due to critical environment issues');
        // Note: In Next.js, we can't actually exit the process, but we can log the error
        // The application will continue but may not function correctly
      }
    } else if (envInfo.hasDatabase) {
      // If we have a database configured and no critical env issues, test the connection
      console.log('[STARTUP] Testing database connection...');
      try {
        const dbConnection = await validateDbConnection();

        if (dbConnection.connected) {
          console.log(
            `[STARTUP] ✅ Database connection validated (${dbConnection.latency}ms)`
          );
        } else {
          console.error(
            '[STARTUP] ❌ Database connection failed:',
            dbConnection.error
          );
          // Don't fail startup for database issues, but log them prominently
          if (process.env.NODE_ENV === 'production') {
            console.error(
              '[STARTUP] WARNING: Application starting without database connectivity'
            );
          }
        }
      } catch (dbError) {
        console.error(
          '[STARTUP] Database connection validation crashed:',
          dbError
        );
      }
    }

    // Log summary
    if (validationResult.valid) {
      console.log('[STARTUP] ✅ Environment validation completed successfully');
    } else {
      const totalIssues =
        validationResult.errors.length +
        validationResult.warnings.length +
        validationResult.critical.length;
      console.warn(
        `[STARTUP] ⚠️  Environment validation completed with ${totalIssues} issue(s)`
      );
    }

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
