import { register } from '@/instrumentation';

let initializationPromise: Promise<void> | null = null;

/** Timeout for Sentry initialization to prevent blocking renders.
 * Extended in development since cold starts are slower and we don't need
 * edge-function latency constraints. */
const SENTRY_INIT_TIMEOUT_MS =
  process.env.NODE_ENV === 'development' ? 5000 : 100;

/**
 * Ensures the Sentry SDK is initialized for the current execution context.
 * Initialization is cached so that we only load the SDK once per Node/Edge worker.
 *
 * Uses a timeout to prevent blocking renders if Sentry is unreachable.
 * If initialization times out, Sentry will continue initializing in the background.
 */
export function ensureSentry(): Promise<void> {
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
