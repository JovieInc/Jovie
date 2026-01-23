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
 * Integration type - inferred from Sentry's breadcrumbsIntegration return type
 */
type SentryIntegration = ReturnType<typeof Sentry.breadcrumbsIntegration>;

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
): Sentry.BrowserOptions {
  const baseConfig = getBaseClientConfig();
  const {
    tracesSampleRate = TRACES_SAMPLE_RATE,
    replaysSessionSampleRate = REPLAY_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate = REPLAY_ERROR_SAMPLE_RATE,
    additionalIntegrations = [],
    enableBreadcrumbs = true,
    enableReplay = process.env.NODE_ENV === 'development',
  } = options;

  // Build integrations array - full set including Replay
  const integrations: SentryIntegration[] = [];

  // Add breadcrumb integration if enabled (default behavior)
  if (enableBreadcrumbs) {
    integrations.push(Sentry.breadcrumbsIntegration());
  }

  // Add Replay integration if enabled
  if (enableReplay) {
    integrations.push(Sentry.replayIntegration());
    isReplayLoaded = true;
  }

  // Add any custom integrations
  integrations.push(...additionalIntegrations);

  return {
    dsn: baseConfig.dsn,
    tracesSampleRate,
    enableLogs: baseConfig.enableLogs,
    sendDefaultPii: baseConfig.sendDefaultPii,
    beforeSend: baseConfig.beforeSend,

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
 * Dynamically loads and adds the Replay integration to an already-initialized Sentry client.
 *
 * This is useful when upgrading from a lite SDK to full SDK during navigation,
 * without re-initializing the entire SDK.
 *
 * **Note:** This function is only available in development due to CSP restrictions.
 * Sentry Replay uses eval() internally, which is blocked by Content Security Policy
 * in production where 'unsafe-eval' is not allowed. In production, this function
 * returns false immediately without loading replay.
 *
 * @returns Promise<boolean> - true if Replay was added, false if:
 *   - Running in production (CSP restriction)
 *   - Replay already loaded
 *   - Sentry client not initialized
 *
 * @example
 * // Upgrade lite SDK with Replay when user navigates to dashboard (dev only)
 * if (isNavigatingToDashboard) {
 *   await addReplayIntegration();
 * }
 */
export async function addReplayIntegration(): Promise<boolean> {
  // Skip in production - Sentry Replay uses eval() which violates CSP
  // when 'unsafe-eval' is not allowed (only permitted in development)
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  // Skip if Replay is already loaded
  if (isReplayLoaded) {
    return false;
  }

  // Get the current client
  const client = Sentry.getClient();
  if (!client) {
    return false;
  }

  // Dynamically import Replay integration to enable code splitting
  const { replayIntegration } = await import('@sentry/nextjs');

  // Add the Replay integration to the existing client
  client.addIntegration(replayIntegration());
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

  // Default enableReplay to development-only to avoid CSP violations in production.
  // Sentry Replay uses eval() internally, which violates CSP when 'unsafe-eval' is not allowed.
  const {
    enableReplay = process.env.NODE_ENV === 'development',
    ...restOptions
  } = options;

  // First, initialize with base configuration (no Replay yet)
  const configWithoutReplay = getFullClientConfig({
    ...restOptions,
    enableReplay: false,
  });

  Sentry.init(configWithoutReplay);
  isInitialized = true;

  // Then, if Replay is enabled, load it asynchronously
  if (enableReplay) {
    await addReplayIntegration();
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
