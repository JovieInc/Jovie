import { register } from '@/instrumentation';

let initializationPromise: Promise<void> | null = null;

function shouldSkipLocalSentry(): boolean {
  const isLocalRuntime =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.NEXT_PUBLIC_E2E_MODE === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
  return isLocalRuntime && process.env.JOVIE_ENABLE_LOCAL_SENTRY !== '1';
}

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
  if (shouldSkipLocalSentry()) {
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
