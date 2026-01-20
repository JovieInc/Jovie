import * as Sentry from '@sentry/nextjs';

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
        // Log critical issues to Sentry so they're visible in monitoring
        Sentry.captureMessage(
          `Critical environment issues at startup: ${result.critical.join(', ')}`,
          'error'
        );
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
