/**
 * Sentry Lite Client Configuration
 *
 * This module provides a minimal Sentry SDK initialization for public-facing pages
 * where performance (LCP) is critical. It includes only core error tracking without
 * heavier integrations like Replay or Profiling.
 *
 * Use this for:
 * - Public artist profile pages (/[username]/*)
 * - Marketing pages (/(marketing)/*)
 * - Auth pages (/(auth)/*)
 *
 * For dashboard pages that need full features, use client-full.ts instead.
 *
 * @module lib/sentry/client-lite
 */

import * as Sentry from '@sentry/nextjs';
import {
  getBaseClientConfig,
  SENTRY_DSN_CLIENT,
  TRACES_SAMPLE_RATE,
} from './config';

/**
 * Flag to track initialization state.
 * Prevents multiple initializations if called more than once.
 */
let isInitialized = false;

/**
 * Integration type - inferred from Sentry's breadcrumbsIntegration return type
 */
type SentryIntegration = ReturnType<typeof Sentry.breadcrumbsIntegration>;

/**
 * Lite Sentry configuration options.
 * Excludes Replay, Profiling, and other heavy integrations.
 */
export interface LiteSentryConfig {
  /**
   * Custom sample rate override (optional)
   * Defaults to the shared TRACES_SAMPLE_RATE
   */
  tracesSampleRate?: number;

  /**
   * Additional integrations to include (optional)
   * These should be lightweight integrations only
   */
  additionalIntegrations?: SentryIntegration[];

  /**
   * Enable breadcrumbs for console, fetch, and history (default: true)
   * Disable for even smaller footprint
   */
  enableBreadcrumbs?: boolean;
}

/**
 * Returns the lite client configuration object without initializing Sentry.
 * Useful for testing or when you need to inspect the config before init.
 *
 * @param options - Optional configuration overrides
 * @returns The complete lite Sentry configuration object
 */
export function getLiteClientConfig(
  options: LiteSentryConfig = {}
): Sentry.BrowserOptions {
  const baseConfig = getBaseClientConfig();
  const {
    tracesSampleRate = TRACES_SAMPLE_RATE,
    additionalIntegrations = [],
    enableBreadcrumbs = true,
  } = options;

  // Build integrations array - minimal set for core error tracking
  const integrations: SentryIntegration[] = [];

  // Add breadcrumb integration if enabled (default behavior)
  if (enableBreadcrumbs) {
    integrations.push(Sentry.breadcrumbsIntegration());
  }

  // Add any custom lightweight integrations
  integrations.push(...additionalIntegrations);

  return {
    dsn: baseConfig.dsn,
    tracesSampleRate,
    enableLogs: baseConfig.enableLogs,
    sendDefaultPii: baseConfig.sendDefaultPii,
    beforeSend: baseConfig.beforeSend,

    // Lite-specific: minimal integrations (no Replay, no Profiling)
    integrations,

    // Disable Replay sample rates since we're not using Replay
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };
}

/**
 * Initializes Sentry with the lite client configuration.
 *
 * This is a lightweight initialization that includes only core error tracking.
 * It's designed for public pages where performance (LCP) is critical.
 *
 * Features included:
 * - Error capturing (captureException, captureMessage)
 * - Breadcrumb collection (console, fetch, history)
 * - Basic performance monitoring (tracing)
 *
 * Features excluded (to reduce bundle size):
 * - Session Replay (~40-50KB gzipped)
 * - Profiling (~10-15KB gzipped)
 *
 * @param options - Optional configuration overrides
 * @returns true if initialization was performed, false if already initialized
 *
 * @example
 * // Basic initialization
 * initLiteSentry();
 *
 * @example
 * // With custom sample rate
 * initLiteSentry({ tracesSampleRate: 0.05 });
 */
export function initLiteSentry(options: LiteSentryConfig = {}): boolean {
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

  const config = getLiteClientConfig(options);
  Sentry.init(config);
  isInitialized = true;

  return true;
}

/**
 * Checks if the lite Sentry client has been initialized.
 * Useful for conditional logic that depends on Sentry state.
 *
 * @returns true if initLiteSentry() has been called successfully
 */
export function isLiteSentryInitialized(): boolean {
  return isInitialized;
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
