/**
 * Sentry Full Client Configuration
 *
 * This module provides a complete Sentry SDK initialization for dashboard pages
 * where full error tracking, session replay, and performance monitoring are required.
 *
 * Use this for:
 * - Dashboard pages (/app/*)
 * - Admin pages
 * - Any authenticated user area where debugging is critical
 *
 * For public-facing pages that prioritize performance (LCP), use client-lite.ts instead.
 *
 * @module lib/sentry/client-full
 */

import * as Sentry from '@sentry/nextjs';
import {
  getBaseClientConfig,
  REPLAY_ERROR_SAMPLE_RATE,
  REPLAY_SESSION_SAMPLE_RATE,
  SENTRY_DSN_CLIENT,
  TRACES_SAMPLE_RATE,
} from './config';
import {
  getReplaySessionSampleRate,
  isAutomatedBrowser,
  isGoldenPathRoute,
} from './replay-policy';

/**
 * Flag to track initialization state.
 * Prevents multiple initializations if called more than once.
 */
let isInitialized = false;

/**
 * Flag to track if Replay integration has been loaded.
 * Used for lazy loading Replay on navigation from public to dashboard.
 */
let isReplayLoaded = false;

/**
 * Integration type. SDK v10 no longer exports `Integration` from @sentry/nextjs's
 * isomorphic surface, so derive it from the init() options' integrations array.
 */
type SentryIntegration = Extract<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['integrations']>,
  readonly unknown[]
>[number];

/**
 * breadcrumbsIntegration / replayIntegration are client-only exports that exist
 * on @sentry/nextjs at runtime in the browser build but are absent from its
 * isomorphic type surface in SDK v10. Cast to a typed view of just the
 * client-only factories this module calls.
 */
const clientSentry = Sentry as typeof Sentry & {
  breadcrumbsIntegration: () => SentryIntegration;
  replayIntegration: (options?: Record<string, unknown>) => SentryIntegration;
};

/**
 * Privacy options for every Replay recording. All text and inputs (emails,
 * passwords, one-time codes) are masked, media is blocked, and no request or
 * response bodies are captured. Passed explicitly so a future SDK default
 * change cannot loosen masking.
 */
export const REPLAY_PRIVACY_OPTIONS = {
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
  networkDetailAllowUrls: [] as string[],
  networkCaptureBodies: false,
} as const;

/**
 * Full Sentry configuration options.
 * Includes all integrations: Replay, performance monitoring, etc.
 */
export interface FullSentryConfig {
  /**
   * Custom trace sample rate override (optional)
   * Defaults to the shared TRACES_SAMPLE_RATE
   */
  tracesSampleRate?: number;

  /**
   * Custom replay session sample rate override (optional)
   * Defaults to REPLAY_SESSION_SAMPLE_RATE
   */
  replaysSessionSampleRate?: number;

  /**
   * Custom replay error sample rate override (optional)
   * Defaults to REPLAY_ERROR_SAMPLE_RATE (100%)
   */
  replaysOnErrorSampleRate?: number;

  /**
   * Additional integrations to include (optional)
   */
  additionalIntegrations?: SentryIntegration[];

  /**
   * Enable breadcrumbs for console, fetch, and history (default: true)
   */
  enableBreadcrumbs?: boolean;

  /**
   * Enable Session Replay (default: true)
   * Set to false to disable replay even in full SDK mode
   */
  enableReplay?: boolean;
}

/**
 * Returns the full client configuration object without initializing Sentry.
 * Useful for testing or when you need to inspect the config before init.
 *
 * Note: This includes the Replay integration synchronously. For lazy loading,
 * use initFullSentryAsync() or addReplayIntegration() instead.
 *
 * @param options - Optional configuration overrides
 * @returns The complete full Sentry configuration object
 */
export function getFullClientConfig(
  options: FullSentryConfig = {}
): NonNullable<Parameters<typeof Sentry.init>[0]> {
  const baseConfig = getBaseClientConfig();
  const {
    tracesSampleRate = TRACES_SAMPLE_RATE,
    replaysSessionSampleRate = REPLAY_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate = REPLAY_ERROR_SAMPLE_RATE,
    additionalIntegrations = [],
    enableBreadcrumbs = true,
    enableReplay = true,
  } = options;

  // Build integrations array - full set including Replay
  const integrations: SentryIntegration[] = [];

  // Add breadcrumb integration if enabled (default behavior)
  if (enableBreadcrumbs) {
    integrations.push(clientSentry.breadcrumbsIntegration());
  }

  // Add Replay integration if enabled
  if (enableReplay) {
    integrations.push(
      clientSentry.replayIntegration({ ...REPLAY_PRIVACY_OPTIONS })
    );
    isReplayLoaded = true;
  }

  // Add any custom integrations
  integrations.push(...additionalIntegrations);

  return {
    // Reconstructing field-by-field dropped ignoreErrors/release, so the
    // JOV-5182 JSON bag never hit InboundFilters on dashboard routes.
    ...baseConfig,
    tracesSampleRate,

    // Full integrations including Replay
    integrations,

    // Replay sample rates
    replaysSessionSampleRate: enableReplay ? replaysSessionSampleRate : 0,
    replaysOnErrorSampleRate: enableReplay ? replaysOnErrorSampleRate : 0,
  };
}

/**
 * Initializes Sentry with the full client configuration (synchronous).
 *
 * This initialization includes all features:
 * - Error capturing (captureException, captureMessage)
 * - Breadcrumb collection (console, fetch, history)
 * - Performance monitoring (tracing)
 * - Session Replay (~40-50KB gzipped)
 *
 * For lazy loading the Replay integration, use initFullSentryAsync() instead.
 *
 * @param options - Optional configuration overrides
 * @returns true if initialization was performed, false if already initialized
 *
 * @example
 * // Basic initialization with all features
 * initFullSentry();
 *
 * @example
 * // With custom sample rates
 * initFullSentry({
 *   tracesSampleRate: 0.2,
 *   replaysSessionSampleRate: 0.05
 * });
 */
export function initFullSentry(options: FullSentryConfig = {}): boolean {
  // Prevent multiple initializations
  if (isInitialized) {
    return false;
  }

  // Skip initialization if DSN is not configured
  if (!SENTRY_DSN_CLIENT) {
    if (process.env.NODE_ENV === 'development') {
      // Silent in development - DSN often not configured locally
    }
    return false;
  }

  const config = getFullClientConfig(options);
  Sentry.init(config);
  isInitialized = true;

  return true;
}

/**
 * Dynamically loads and adds the Replay integration to an already-initialized
 * Sentry client (lite or full).
 *
 * Replay's compression worker is an inline blob (CSP `worker-src 'self' blob:`
 * is already allowed); it does not need `unsafe-eval`, so this runs in
 * production too.
 *
 * @param sessionSampleRate - Session sample rate for this route (see
 *   replay-policy). Defaults to the shared dashboard rate.
 * @param buffer - Buffer mode: record into memory and send nothing until
 *   `replay.flush()` is called (see replay-start). Error auto-send is off so
 *   every send goes through the monthly cap guard.
 * @returns true if Replay was added, false if already loaded or no client.
 */
export async function addReplayIntegration(
  sessionSampleRate: number = REPLAY_SESSION_SAMPLE_RATE,
  buffer = false
): Promise<boolean> {
  if (isReplayLoaded) {
    return false;
  }

  const client = Sentry.getClient();
  if (!client) {
    return false;
  }

  // The Replay integration reads its sample rates from the client options when
  // it is added, so set them first.
  const options = client.getOptions() as unknown as Record<string, unknown>;
  options.replaysSessionSampleRate = buffer ? 0 : sessionSampleRate;
  options.replaysOnErrorSampleRate = buffer ? 0 : REPLAY_ERROR_SAMPLE_RATE;

  // replayIntegration is a client-only runtime export (see clientSentry note).
  const mod = (await import('@sentry/nextjs')) as unknown as {
    replayIntegration: (options?: Record<string, unknown>) => SentryIntegration;
  };

  const integration = mod.replayIntegration({ ...REPLAY_PRIVACY_OPTIONS });
  client.addIntegration(integration);
  if (buffer) {
    (integration as unknown as { startBuffering: () => void }).startBuffering();
  }
  isReplayLoaded = true;

  return true;
}

/**
 * Initializes Sentry with full configuration, loading Replay lazily.
 *
 * This provides the same functionality as initFullSentry() but loads
 * the Replay integration asynchronously to enable better code splitting.
 *
 * Use this when you want to initialize full Sentry but defer Replay loading
 * to reduce initial bundle size while still having full features available.
 *
 * @param options - Optional configuration overrides
 * @returns Promise<boolean> - true if initialization was performed
 *
 * @example
 * // Initialize with lazy Replay loading
 * await initFullSentryAsync();
 */
export async function initFullSentryAsync(
  options: FullSentryConfig = {}
): Promise<boolean> {
  // Prevent multiple initializations
  if (isInitialized) {
    return false;
  }

  // Skip initialization if DSN is not configured
  if (!SENTRY_DSN_CLIENT) {
    if (process.env.NODE_ENV === 'development') {
      // Silent in development - DSN often not configured locally
    }
    return false;
  }

  const { enableReplay = true, ...restOptions } = options;

  // First, initialize with base configuration (no Replay yet)
  const configWithoutReplay = getFullClientConfig({
    ...restOptions,
    enableReplay: false,
  });

  Sentry.init(configWithoutReplay);
  isInitialized = true;

  // Then, if Replay is enabled, load it asynchronously
  if (enableReplay && !isAutomatedBrowser(globalThis.navigator)) {
    const pathname = globalThis.location?.pathname ?? '/app';
    const rate = restOptions.replaysSessionSampleRate;
    await addReplayIntegration(
      rate ?? getReplaySessionSampleRate(pathname),
      isGoldenPathRoute(pathname)
    );
  }

  return true;
}

/**
 * Checks if the full Sentry client has been initialized.
 * Useful for conditional logic that depends on Sentry state.
 *
 * @returns true if initFullSentry() or initFullSentryAsync() has been called successfully
 */
export function isFullSentryInitialized(): boolean {
  return isInitialized;
}

/**
 * Checks if the Replay integration has been loaded.
 * Useful for determining if session replay is active.
 *
 * @returns true if Replay integration is loaded
 */
export function isReplayEnabled(): boolean {
  return isReplayLoaded;
}

/**
 * Gets the current Sentry client instance.
 * Returns undefined if Sentry has not been initialized.
 *
 * @returns The Sentry client or undefined
 */
export function getSentryClient() {
  return Sentry.getClient();
}

/**
 * Re-export Sentry's router transition capture for Next.js App Router.
 * This should be used regardless of SDK variant for navigation tracking.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
