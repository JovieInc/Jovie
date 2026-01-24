import * as Sentry from '@sentry/nextjs';

/**
 * Determine if an environment issue should be reported to Sentry.
 * Some "critical" issues are expected in certain contexts (e.g., builds, E2E tests)
 * and shouldn't pollute Sentry with noise.
 */
function shouldReportToSentry(issues: string[]): boolean {
  // Don't report if we're in a build/test context where env vars are expected to be missing
  const vercelEnv = process.env.VERCEL_ENV;
  const isBuildOrDev =
    !vercelEnv || vercelEnv === 'development' || process.env.CI === 'true';

  if (isBuildOrDev) {
    return false;
  }

  // Filter out issues that are warnings in disguise or expected in certain contexts
  const trulyBlockingIssues = issues.filter(issue => {
    // Clerk key missing during SSR might be handled by bypass mode
    if (issue.includes('CLERK') && process.env.NEXT_PUBLIC_CLERK_MOCK === '1') {
      return false;
    }
    return true;
  });

  return trulyBlockingIssues.length > 0;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Run environment validation at startup to detect issues early
    // This catches build-time vs runtime environment differences on Vercel
    try {
      const { runStartupEnvironmentValidation } = await import(
        '@/lib/startup/environment-validator'
      );
      const result = await runStartupEnvironmentValidation();

      if (result && result.critical.length > 0) {
        // Only report to Sentry if the issues are truly blocking in production
        if (shouldReportToSentry(result.critical)) {
          Sentry.captureMessage(
            `Critical environment issues at startup: ${result.critical.join(', ')}`,
            {
              level: 'warning', // Changed from 'error' - these are config issues, not app errors
              tags: {
                context: 'startup_environment_validation',
                vercel_env: process.env.VERCEL_ENV || 'unknown',
              },
              extra: {
                critical_issues: result.critical,
                warning_issues: result.warnings,
                error_issues: result.errors,
              },
            }
          );
        }
      }
    } catch (error) {
      console.error('[STARTUP] Environment validation failed:', error);
      Sentry.captureException(error, {
        extra: { context: 'startup_environment_validation' },
      });
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
