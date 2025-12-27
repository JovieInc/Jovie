import { validateDbConnection } from '@/lib/db';
import {
  getEnvironmentInfo,
  validateAndLogEnvironment,
} from '@/lib/env-server';
import { validateDatabaseUrl } from '@/lib/utils/database-url-validator';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('Startup');

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
    log.info('Running environment validation...', undefined, {
      alwaysLog: true,
    });

    // Run the validation
    validationResult = validateAndLogEnvironment('runtime');

    // Log additional startup information
    const envInfo = getEnvironmentInfo();
    log.info(
      'Environment Info',
      {
        environment: envInfo.nodeEnv,
        platform: envInfo.platform,
        nodeVersion: envInfo.nodeVersion,
        integrations: {
          database: envInfo.hasDatabase,
          auth: envInfo.hasClerk,
          payments: envInfo.hasStripe,
          images: envInfo.hasCloudinary,
        },
      },
      { alwaysLog: true }
    );

    // Handle critical failures
    if (validationResult.critical.length > 0) {
      log.error(
        'CRITICAL: Application cannot start due to missing required environment variables'
      );
      log.error('Critical issues', { issues: validationResult.critical });

      // In production, we might want to exit or throw an error
      // In development, we'll continue with warnings
      if (process.env.NODE_ENV === 'production') {
        log.error('Exiting due to critical environment issues');
        // Note: In Next.js, we can't actually exit the process, but we can log the error
        // The application will continue but may not function correctly
      }
    } else if (envInfo.hasDatabase) {
      // If we have a database configured and no critical env issues, test the connection
      log.info('Testing database connection...', undefined, {
        alwaysLog: true,
      });
      try {
        const dbConnection = await validateDbConnection();

        if (dbConnection.connected) {
          log.info(
            `Database connection validated (${dbConnection.latency}ms)`,
            undefined,
            { alwaysLog: true }
          );
        } else {
          log.error('Database connection failed', {
            error: dbConnection.error,
          });
          // Don't fail startup for database issues, but log them prominently
          if (process.env.NODE_ENV === 'production') {
            log.error(
              'WARNING: Application starting without database connectivity'
            );
          }
        }
      } catch (dbError) {
        log.error('Database connection validation crashed', {
          error: dbError,
        });
      }
    }

    // Log summary
    if (validationResult.valid) {
      log.info('Environment validation completed successfully', undefined, {
        alwaysLog: true,
      });
    } else {
      const totalIssues =
        validationResult.errors.length +
        validationResult.warnings.length +
        validationResult.critical.length;
      log.warn(`Environment validation completed with ${totalIssues} issue(s)`);
    }

    validationCompleted = true;
    return validationResult;
  } catch (error) {
    log.error('Environment validation failed', { error });
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
