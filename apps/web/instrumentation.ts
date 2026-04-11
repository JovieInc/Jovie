// Track instrumentation lifecycle for cold start detection
const INSTRUMENTATION_START_TIME = Date.now();
let firstValidationAttemptTime: number | null = null;
let validationResolvedTime: number | null = null;

type SentryModule = {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, context?: Record<string, unknown>) => void;
  captureRequestError: (...args: unknown[]) => unknown;
};

let sentryModulePromise: Promise<SentryModule> | null = null;

function loadSentry(): Promise<SentryModule> {
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/nextjs').then(module => ({
      captureException: module.captureException,
      captureMessage: module.captureMessage,
      captureRequestError: (...args: unknown[]) =>
        module.captureRequestError(
          ...(args as Parameters<typeof module.captureRequestError>)
        ),
    }));
  }

  return sentryModulePromise;
}

/**
 * Determine if an environment issue should be reported to Sentry.
 * Some "critical" issues are expected in certain contexts (e.g., builds, E2E tests)
 * and shouldn't pollute Sentry with noise.
 */
function shouldReportToSentry(issues: string[]): boolean {
  // Cold start grace period: if validation resolved quickly, it was a timing issue
  if (validationResolvedTime && firstValidationAttemptTime) {
    const resolutionTime = validationResolvedTime - firstValidationAttemptTime;

    if (resolutionTime <= VALIDATION_RETRY_CONFIG.coldStartGracePeriod) {
      console.log(
        `[STARTUP] Skipping Sentry report - issues resolved within cold start grace period ` +
          `(${resolutionTime}ms < ${VALIDATION_RETRY_CONFIG.coldStartGracePeriod}ms)`
      );
      return false;
    }
  }

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

/**
 * Configuration for progressive retry with exponential backoff.
 * Shorter than database retries (15s) since env vars initialize faster on Vercel.
 */
const VALIDATION_RETRY_CONFIG = {
  intervals: [100, 250, 500, 1000, 2000] as const,
  maxRetries: 5,
  coldStartGracePeriod: 5000, // Don't report to Sentry if resolved within 5s (Doppler can take up to 4s on cold starts)
} as const;

/**
 * Run environment validation with progressive retry logic for cold starts.
 * On Vercel cold starts, environment variables may not be immediately available,
 * so we retry with exponential backoff to allow for initialization.
 */
async function runEnvironmentValidationWithRetry() {
  const { runStartupEnvironmentValidation } = await import(
    '@/lib/startup/environment-validator'
  );

  // Track first validation attempt time
  if (!firstValidationAttemptTime) {
    firstValidationAttemptTime = Date.now();
  }

  // First attempt
  let result = await runStartupEnvironmentValidation();

  // If we have critical issues, retry with progressive backoff
  if (result && result.critical.length > 0) {
    for (
      let attempt = 0;
      attempt < VALIDATION_RETRY_CONFIG.maxRetries;
      attempt++
    ) {
      const delay = VALIDATION_RETRY_CONFIG.intervals[attempt];
      const timeSinceInstrumentation = Date.now() - INSTRUMENTATION_START_TIME;

      console.log(
        `[STARTUP] Critical issues detected (attempt ${attempt + 1}/${VALIDATION_RETRY_CONFIG.maxRetries}), ` +
          `retrying after ${delay}ms delay (${timeSinceInstrumentation}ms since instrumentation start)...`
      );

      // Wait for environment to initialize
      await new Promise(resolve => setTimeout(resolve, delay));

      // Retry validation
      result = await runStartupEnvironmentValidation();

      const isLastAttempt = attempt === VALIDATION_RETRY_CONFIG.maxRetries - 1;
      const validationPassed = !result || result.critical.length === 0;

      // Track resolution time when validation passes or we've exhausted retries
      if (validationPassed || isLastAttempt) {
        validationResolvedTime = Date.now();
        const totalRetryTime =
          validationResolvedTime - firstValidationAttemptTime;

        if (validationPassed) {
          const timeSinceInstrumentation =
            validationResolvedTime - INSTRUMENTATION_START_TIME;
          console.log(
            `[STARTUP] Retry successful on attempt ${attempt + 2} - environment now valid ` +
              `(resolved in ${totalRetryTime}ms, ${timeSinceInstrumentation}ms since instrumentation start)`
          );
          break;
        }

        // Last attempt failed
        console.warn(
          `[STARTUP] Critical issues persist after all retries (${totalRetryTime}ms total retry time)`
        );
      }
    }
  } else {
    // No critical issues on first attempt
    validationResolvedTime = Date.now();
  }

  return result;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Skip Sentry server SDK and startup validation in local/dev and CI.
    // CI public-route jobs boot production builds for smoke/a11y/Lighthouse, and
    // the server SDK adds no signal there while increasing startup fragility.
    const isDev = process.env.NODE_ENV === 'development';
    const isCi = process.env.CI === 'true';
    const shouldSkipServerInstrumentation = isDev || isCi;

    if (!shouldSkipServerInstrumentation) {
      const Sentry = await loadSentry();
      await import('./sentry.server.config');
      // Run environment validation at startup to detect issues early
      // This catches build-time vs runtime environment differences on Vercel
      try {
        const result = await runEnvironmentValidationWithRetry();

        if (result && result.critical.length > 0) {
          // Only report to Sentry if the issues are truly blocking in production
          if (shouldReportToSentry(result.critical)) {
            // Calculate timing metadata
            const timeSinceInstrumentation =
              Date.now() - INSTRUMENTATION_START_TIME;
            const retryDuration =
              validationResolvedTime && firstValidationAttemptTime
                ? validationResolvedTime - firstValidationAttemptTime
                : null;
            const hadRetries =
              firstValidationAttemptTime !== validationResolvedTime;

            Sentry.captureMessage(
              `Critical environment issues at startup: ${result.critical.join(', ')}`,
              {
                level: 'warning', // Changed from 'error' - these are config issues, not app errors
                tags: {
                  context: 'startup_environment_validation',
                  vercel_env: process.env.VERCEL_ENV || 'unknown',
                  is_cold_start_timing: hadRetries ? 'true' : 'false',
                },
                extra: {
                  critical_issues: result.critical,
                  warning_issues: result.warnings,
                  error_issues: result.errors,
                  timing: {
                    time_since_instrumentation_ms: timeSinceInstrumentation,
                    retry_duration_ms: retryDuration,
                    first_attempt_timestamp: firstValidationAttemptTime,
                    resolved_timestamp: validationResolvedTime,
                  },
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

      // Validate Stripe billing config with same retry logic as env validation
      try {
        const { validateStripeBillingConfig } = await import(
          '@/lib/stripe/startup-validation'
        );
        let stripeResult = validateStripeBillingConfig();

        if (!stripeResult.healthy) {
          for (let i = 0; i < VALIDATION_RETRY_CONFIG.maxRetries; i++) {
            const delay = VALIDATION_RETRY_CONFIG.intervals[i];
            console.log(
              `[STARTUP] Stripe config unhealthy (attempt ${i + 1}/${VALIDATION_RETRY_CONFIG.maxRetries}), retrying after ${delay}ms...`
            );
            await new Promise(r => setTimeout(r, delay));
            stripeResult = validateStripeBillingConfig();
            if (stripeResult.healthy) {
              console.log(`[STARTUP] Stripe config healthy on retry ${i + 2}`);
              break;
            }
          }
        }

        // Note: validateStripeBillingConfig() already reports to Sentry at
        // 'fatal' level on deployed environments — no duplicate report needed here.
        if (!stripeResult.healthy) {
          console.warn(
            `[STARTUP] Stripe billing config still unhealthy after retries: ${stripeResult.issues.join(', ')}`
          );
        }
      } catch (error) {
        console.error('[STARTUP] Stripe billing validation failed:', error);
        Sentry.captureException(error, {
          extra: { context: 'stripe_startup_validation' },
        });
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const isCi = process.env.CI === 'true';
    if (process.env.NODE_ENV !== 'development' && !isCi) {
      await import('./sentry.edge.config');
    }
  }
}

export async function onRequestError(...args: unknown[]) {
  const isDev = process.env.NODE_ENV === 'development';
  const isCi = process.env.CI === 'true';

  if (isDev || isCi) {
    return;
  }

  const Sentry = await loadSentry();
  return Sentry.captureRequestError(...args);
}
