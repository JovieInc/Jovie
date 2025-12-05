import { register } from '@/instrumentation';

let initializationPromise: Promise<void> | null = null;

/**
 * Ensures the Sentry SDK is initialized for the current execution context.
 * Initialization is cached so that we only load the SDK once per Node/Edge worker.
 */
export function ensureSentry(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = register().catch(error => {
      console.error('[Sentry] Failed to initialize SDK', error);
    });
  }

  return initializationPromise;
}
