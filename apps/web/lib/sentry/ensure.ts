import { register } from '@/instrumentation';

let initializationPromise: Promise<void> | null = null;

/** Timeout for Sentry initialization to prevent blocking renders */
const SENTRY_INIT_TIMEOUT_MS = 100;

/**
 * Ensures the Sentry SDK is initialized for the current execution context.
 * Initialization is cached so that we only load the SDK once per Node/Edge worker.
 *
 * Uses a timeout to prevent blocking renders if Sentry is unreachable.
 * If initialization times out, Sentry will continue initializing in the background.
 */
export function ensureSentry(): Promise<void> {
  // Skip Sentry entirely in development to avoid noisy init timeouts
  if (process.env.NODE_ENV === 'development') {
    return Promise.resolve();
  }

  if (!initializationPromise) {
    const sentryInit = register().catch(error => {
      console.error('[Sentry] Failed to initialize SDK', error);
    });

    // Race against timeout to prevent blocking renders
    initializationPromise = Promise.race([
      sentryInit,
      new Promise<void>(resolve =>
        setTimeout(() => {
          console.warn(
            `[Sentry] Initialization timed out after ${SENTRY_INIT_TIMEOUT_MS}ms, continuing in background`
          );
          resolve();
        }, SENTRY_INIT_TIMEOUT_MS)
      ),
    ]);
  }

  return initializationPromise;
}
