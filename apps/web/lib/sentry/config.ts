/**
 * Sentry Shared Configuration
 *
 * This module provides common configuration options, constants, and utilities
 * that are shared between the lite (public pages) and full (dashboard) Sentry
 * SDK configurations. This ensures consistency and avoids duplication across
 * different SDK variants.
 *
 * ## Lazy Loading Architecture
 *
 * Jovie implements a two-tier Sentry SDK strategy to optimize performance:
 *
 * 1. **Lite SDK (~20-30KB gzipped)** - Used on public pages (profiles, marketing)
 *    - Core error tracking only
 *    - No Session Replay, no Profiling
 *    - Optimizes Largest Contentful Paint (LCP) for SEO and user experience
 *
 * 2. **Full SDK (~60-80KB gzipped)** - Used on dashboard pages
 *    - Complete error tracking with Session Replay
 *    - Performance monitoring and breadcrumbs
 *    - Prioritizes debugging capabilities over initial load time
 *
 * This module provides the shared foundation that both SDK variants build upon,
 * ensuring consistent DSN configuration, sample rates, and PII scrubbing across
 * the entire application.
 *
 * ## Bundle Size Impact
 *
 * By extracting shared configuration into this module:
 * - Both lite and full SDK variants use the same base configuration
 * - Configuration code is not duplicated across bundles
 * - Webpack can properly deduplicate these utilities
 *
 * ## Usage
 *
 * ```ts
 * import { getBaseClientConfig, scrubPii, TRACES_SAMPLE_RATE } from '@/lib/sentry/config';
 *
 * // Get shared config for custom initialization
 * const baseConfig = getBaseClientConfig();
 *
 * // Create custom beforeSend hook with additional processing
 * const customBeforeSend = createBeforeSendHook((event) => {
 *   // Additional custom processing
 *   return event;
 * });
 * ```
 *
 * @module lib/sentry/config
 * @see {@link ../client-lite.ts} - Lite SDK for public pages
 * @see {@link ../client-full.ts} - Full SDK for dashboard pages
 * @see {@link ../init.ts} - SDK initialization factory
 */

import type * as Sentry from '@sentry/nextjs';

/**
 * Sentry Event type alias for cleaner code
 */
type SentryEvent = Parameters<
  NonNullable<Sentry.BrowserOptions['beforeSend']>
>[0];
type SentryEventHint = Parameters<
  NonNullable<Sentry.BrowserOptions['beforeSend']>
>[1];

/**
 * Environment detection utilities.
 *
 * These constants are evaluated at build time and can be used for
 * conditional configuration across both SDK variants.
 *
 * @remarks
 * In the lazy loading architecture, environment detection helps determine:
 * - Sample rates (higher in development for complete visibility)
 * - Debug logging (enabled in development only)
 * - Feature flags for testing
 */
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Sentry DSN (Data Source Name) configuration.
 *
 * Both lite and full SDK variants use the same DSN to ensure all errors
 * are captured in a single Sentry project, making it easy to correlate
 * issues across public and dashboard pages.
 *
 * @remarks
 * - Client-side uses `NEXT_PUBLIC_SENTRY_DSN` (exposed to browser bundle)
 * - Server-side uses `SENTRY_DSN` (kept private, not bundled)
 *
 * In the lazy loading architecture:
 * - If DSN is not configured, both SDK variants gracefully skip initialization
 * - This allows local development without Sentry configuration
 * - Errors are tagged with `sentryMode: 'lite' | 'full'` for filtering in Sentry dashboard
 */
export const SENTRY_DSN_CLIENT = process.env.NEXT_PUBLIC_SENTRY_DSN;
export const SENTRY_DSN_SERVER = process.env.SENTRY_DSN;

/**
 * Trace sample rate for performance monitoring.
 *
 * This rate applies to both lite and full SDK variants, ensuring consistent
 * performance data collection across the application.
 *
 * Production uses lower sample rates to reduce costs while still capturing
 * a representative sample of transactions. Development uses 100% sampling
 * for complete visibility during debugging.
 *
 * @remarks
 * In the lazy loading architecture:
 * - Lite SDK: Traces basic page load and navigation performance
 * - Full SDK: Traces include additional context from Session Replay
 *
 * Bundle size note: The traces infrastructure is part of the core Sentry SDK
 * and is included in both lite (~20KB) and full (~60KB) variants.
 */
export const TRACES_SAMPLE_RATE = isProduction ? 0.1 : 1.0;

/**
 * Session Replay sample rates.
 *
 * **IMPORTANT**: These rates only apply to the full SDK variant. The lite SDK
 * does not load Session Replay at all, which is the core optimization in the
 * lazy loading strategy.
 *
 * Session Replay (~40-50KB gzipped) is the largest component of the Sentry SDK.
 * By excluding it from the lite SDK, public pages achieve significantly better
 * Largest Contentful Paint (LCP) scores.
 *
 * @remarks
 * - `REPLAY_SESSION_SAMPLE_RATE`: Percentage of sessions to record proactively
 * - `REPLAY_ERROR_SAMPLE_RATE`: Always capture replay when an error occurs (100%)
 *
 * In the lazy loading architecture:
 * - Lite SDK: Sets these to 0 (Replay not loaded, saves ~40-50KB)
 * - Full SDK: Uses these rates for dashboard pages where debugging is prioritized
 *
 * The 100% error sample rate ensures that when errors occur on dashboard pages,
 * we always have a session recording to understand what the user was doing.
 */
export const REPLAY_SESSION_SAMPLE_RATE = isProduction ? 0.1 : 1.0;
export const REPLAY_ERROR_SAMPLE_RATE = 1.0;

/**
 * Sensitive headers that should be scrubbed from request data
 * before being sent to Sentry.
 *
 * This list is used by the `scrubPii` function in the `beforeSend` hook
 * to filter out authentication credentials and tokens.
 *
 * @remarks
 * The scrubbing is applied consistently to both lite and full SDK variants,
 * ensuring that sensitive data is never sent to Sentry regardless of which
 * SDK is active or how initialization occurred.
 */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
] as const;

/**
 * Query parameter names that may contain sensitive data.
 * Matches the param name and its value (up to the next & or end of string).
 */
const SENSITIVE_QUERY_PARAMS =
  /(^|[?&])(token|key|secret|password|pwd|api_key|auth|session_id|credit_card)=[^&]*/gi;

/**
 * Pattern matching ReferenceErrors from deployment transitions.
 *
 * When a new deployment changes chunk hashes, users with stale JavaScript
 * may encounter ReferenceErrors for modules that haven't loaded properly.
 * These are not application bugs but deployment transition artifacts.
 *
 * Uses a general pattern to catch all "X is not defined" ReferenceErrors
 * rather than enumerating specific variable names, since new chunk-loading
 * failures can surface any variable name after a deployment.
 *
 * These errors are filtered from Sentry to reduce noise while still being
 * handled gracefully by useChunkErrorHandler (which shows a refresh toast).
 */
const DEPLOYMENT_TRANSITION_PATTERN = /^.+ is not defined$/;

/**
 * React/Next.js internal error patterns that are framework noise.
 *
 * These errors originate from React's concurrent rendering scheduler or
 * Next.js's internal caching mechanisms. They are not actionable application
 * bugs and should be filtered to reduce Sentry noise.
 */
const FRAMEWORK_INTERNAL_ERRORS = [
  'headcachenode',
  'should not already be working',
] as const;

/**
 * Checks if an error is an AbortError from request cancellation.
 *
 * AbortController cancellations are expected when users navigate away,
 * requests are deduplicated, or async searches are superseded. Not a bug.
 */
function isAbortError(event: SentryEvent): boolean {
  const type = event.exception?.values?.[0]?.type ?? '';
  const message = event.exception?.values?.[0]?.value ?? '';
  return type === 'AbortError' || (type === 'Error' && message === 'aborted');
}

/**
 * Checks if an error is a hydration mismatch.
 *
 * Hydration mismatches from SSR/client differences are largely mitigated
 * (mounted guards, theme handling) and remaining occurrences are transient.
 * Downgrade to warning instead of dropping entirely for monitoring.
 */
function isHydrationMismatch(event: SentryEvent): boolean {
  const message = event.exception?.values?.[0]?.value?.toLowerCase() ?? '';
  return (
    message.includes('hydration failed') ||
    message.includes("server rendered html didn't match") ||
    message.includes("server rendered text didn't match") ||
    message.includes('switched to client rendering')
  );
}

/**
 * Checks if an error is a deployment transition error that should be filtered.
 *
 * These are ReferenceErrors that occur when users have stale JavaScript
 * after a new deployment. They are handled by useChunkErrorHandler which
 * shows a user-friendly refresh prompt.
 *
 * @param event - The Sentry event to check
 * @returns true if this is a deployment transition error that should be dropped
 */
function isDeploymentTransitionError(event: SentryEvent): boolean {
  const message = event.exception?.values?.[0]?.value?.toLowerCase() ?? '';
  const type = event.exception?.values?.[0]?.type?.toLowerCase() ?? '';

  // Filter ReferenceErrors matching the "X is not defined" pattern
  if (
    type === 'referenceerror' &&
    DEPLOYMENT_TRANSITION_PATTERN.test(message)
  ) {
    return true;
  }

  // Filter chunk loading errors (stale chunks after deployment)
  if (
    type === 'chunkloaderror' ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk')
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if an error is a React/Next.js framework internal error.
 *
 * These errors originate from framework internals (React scheduler,
 * Next.js cache) and are not actionable application bugs.
 *
 * @param event - The Sentry event to check
 * @returns true if this is a framework internal error that should be dropped
 */
function isFrameworkInternalError(event: SentryEvent): boolean {
  const message = event.exception?.values?.[0]?.value?.toLowerCase() ?? '';

  return FRAMEWORK_INTERNAL_ERRORS.some(pattern => message.includes(pattern));
}

/**
 * PII Collection Notice (for documentation purposes):
 *
 * When sendDefaultPii is enabled, Sentry may collect:
 * - User IP addresses (anonymized via beforeSend)
 * - User IDs (Clerk user IDs only, no emails)
 * - Request headers (sensitive headers scrubbed)
 *
 * This data is used for error debugging and is retained per Sentry's data retention policy.
 * Users can request data deletion via privacy@jov.ie.
 */

/**
 * Scrubs PII from Sentry events and filters deployment noise.
 * This is used as the `beforeSend` hook in all Sentry configurations.
 *
 * Actions performed:
 * - Filters deployment transition errors (chunk loading ReferenceErrors)
 * - Filters React/Next.js framework internal errors
 * - Anonymizes IP addresses using Sentry's auto-masking
 * - Removes email addresses from user context
 * - Scrubs sensitive headers from request data
 *
 * @param event - The Sentry event to process
 * @returns The scrubbed event, or null to drop the event
 */
export function scrubPii(event: SentryEvent): SentryEvent | null {
  // Filter deployment transition errors (handled by useChunkErrorHandler)
  if (isDeploymentTransitionError(event)) {
    return null;
  }

  // Filter React/Next.js framework internal errors (not actionable)
  if (isFrameworkInternalError(event)) {
    return null;
  }

  // Filter AbortError from request cancellation (normal navigation behavior)
  if (isAbortError(event)) {
    return null;
  }

  // Downgrade hydration mismatches to warning (transient SSR/client differences)
  if (isHydrationMismatch(event)) {
    event.level = 'warning';
  }

  // Anonymize IP addresses if present
  if (event.user?.ip_address) {
    event.user.ip_address = '{{auto}}';
  }

  // Remove email addresses if present (we use Clerk user IDs instead)
  if (event.user?.email) {
    delete event.user.email;
  }

  // Scrub sensitive headers from request data
  if (event.request?.headers) {
    for (const header of SENSITIVE_HEADERS) {
      if (event.request.headers[header]) {
        event.request.headers[header] = '[Filtered]';
      }
    }
  }

  // Scrub sensitive query parameters from request URLs
  if (event.request?.url) {
    event.request.url = event.request.url.replaceAll(
      SENSITIVE_QUERY_PARAMS,
      '$1$2=[Filtered]'
    );
  }
  if (
    event.request?.query_string &&
    typeof event.request.query_string === 'string'
  ) {
    event.request.query_string = event.request.query_string.replaceAll(
      SENSITIVE_QUERY_PARAMS,
      '$1$2=[Filtered]'
    );
  }

  return event;
}

/**
 * Creates a beforeSend hook that combines PII scrubbing with optional
 * custom processing logic.
 *
 * @param customProcessor - Optional additional processing function
 * @returns A beforeSend function suitable for Sentry configuration
 */
export function createBeforeSendHook(
  customProcessor?: (
    event: SentryEvent,
    hint?: SentryEventHint
  ) => SentryEvent | null
): (event: SentryEvent, hint?: SentryEventHint) => SentryEvent | null {
  return (event: SentryEvent, hint?: SentryEventHint): SentryEvent | null => {
    // First apply PII scrubbing
    const scrubbedEvent = scrubPii(event);

    if (!scrubbedEvent) {
      return null;
    }

    // Then apply any custom processing
    if (customProcessor) {
      return customProcessor(scrubbedEvent, hint);
    }

    return scrubbedEvent;
  };
}

/**
 * Base Sentry client configuration options shared between lite and full variants.
 *
 * This interface defines the core configuration that is identical across both SDK
 * variants, ensuring consistent behavior regardless of which variant is loaded.
 *
 * @remarks
 * In the lazy loading architecture, the base config:
 * - Is included in both lite (~20KB) and full (~60KB) bundles
 * - Is minimal to avoid bloating the lite SDK
 * - Contains only essential configuration (DSN, sampling, PII handling)
 *
 * Individual SDK variants extend this with their specific integrations:
 * - Lite SDK: Adds minimal breadcrumb integration
 * - Full SDK: Adds Replay, enhanced breadcrumbs, and profiling
 */
export interface BaseSentryClientConfig {
  dsn: string | undefined;
  tracesSampleRate: number;
  enableLogs: boolean;
  sendDefaultPii: boolean;
  beforeSend: (
    event: SentryEvent,
    hint?: SentryEventHint
  ) => SentryEvent | null;
}

/**
 * Returns the base client configuration that is shared between
 * lite and full SDK variants.
 *
 * This function is the foundation of the lazy loading architecture. Both SDK
 * variants call this function to get consistent base settings, then extend
 * with their specific integrations.
 *
 * ## Configuration Details
 *
 * - **DSN**: Uses `NEXT_PUBLIC_SENTRY_DSN` for client-side initialization
 * - **Trace Sampling**: Uses the shared `TRACES_SAMPLE_RATE` constant
 * - **Log Enablement**: Always enabled for error breadcrumbs
 * - **PII Handling**: `sendDefaultPii` disabled; user context set server-side only
 * - **Before Send**: Applies `scrubPii` to filter sensitive data
 *
 * ## Lazy Loading Integration
 *
 * ```ts
 * // In client-lite.ts:
 * const config = getBaseClientConfig();
 * // Adds: minimal breadcrumb integration only
 *
 * // In client-full.ts:
 * const config = getBaseClientConfig();
 * // Adds: Replay, full breadcrumbs, profiling
 * ```
 *
 * This separation ensures that:
 * 1. Base configuration is deduplicated in webpack bundles
 * 2. Heavy integrations (Replay, Profiling) are only in the full SDK chunk
 * 3. Lite SDK remains as small as possible for optimal LCP
 *
 * @returns Base configuration object for client-side Sentry initialization
 * @see {@link getLiteClientConfig} - Extends this for public pages
 * @see {@link getFullClientConfig} - Extends this for dashboard pages
 */
export function getBaseClientConfig(): BaseSentryClientConfig {
  return {
    dsn: SENTRY_DSN_CLIENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    enableLogs: true,
    sendDefaultPii: false, // Disabled on client - user context set server-side only
    beforeSend: scrubPii,
  };
}

/**
 * Base Sentry server configuration options shared between server and edge runtimes.
 *
 * @remarks
 * Server-side Sentry configuration does not use the lazy loading architecture
 * since server bundles are not sent to the client. However, we maintain
 * consistency with client configuration patterns for maintainability.
 *
 * Server configuration differs from client in that it:
 * - Uses the private `SENTRY_DSN` (not exposed to browser)
 * - Enables `sendDefaultPii` for richer error context (safely scrubbed)
 * - Does not have Replay (server-side rendering cannot record sessions)
 */
export interface BaseSentryServerConfig {
  dsn: string | undefined;
  tracesSampleRate: number;
  enableLogs: boolean;
  sendDefaultPii: boolean;
  debug: boolean;
  beforeSend: (
    event: SentryEvent,
    hint?: SentryEventHint
  ) => SentryEvent | null;
}

/**
 * Returns the base server configuration that is shared between
 * server and edge runtime Sentry configurations.
 *
 * Unlike the client configuration which has lite/full variants for lazy loading,
 * server configuration is uniform since it doesn't impact client bundle size.
 *
 * ## Key Differences from Client Config
 *
 * - **DSN**: Uses private `SENTRY_DSN` (never exposed to browser)
 * - **PII**: `sendDefaultPii` is enabled since it's safely scrubbed via `beforeSend`
 *   and provides valuable debugging context for server errors
 * - **Debug**: Disabled to suppress initialization timeout warnings in production
 *
 * @returns Base configuration object for server-side Sentry initialization
 * @see {@link getBaseClientConfig} - Client-side equivalent with lazy loading support
 */
export function getBaseServerConfig(): BaseSentryServerConfig {
  return {
    dsn: SENTRY_DSN_SERVER,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    enableLogs: true,
    sendDefaultPii: true, // Enabled on server - scrubbed via beforeSend hook
    debug: false, // Suppress initialization timeout warnings
    beforeSend: scrubPii,
  };
}

/**
 * Type guard to check if the code is running on the client side.
 *
 * This utility is essential for the lazy loading architecture because:
 * - SDK variant selection (lite vs full) only applies on client
 * - Route detection uses `globalThis.location` which is client-only
 * - Dynamic imports for code splitting require client-side context
 *
 * @returns `true` if running in browser, `false` if server-side
 *
 * @example
 * ```ts
 * if (isClientSide()) {
 *   // Safe to access window, detect routes, and initialize client SDK
 *   await initSentry();
 * }
 * ```
 */
export function isClientSide(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Type guard to check if the code is running on the server side.
 *
 * Server-side code uses a single Sentry configuration (no lite/full variants)
 * since server bundles don't impact client page load performance.
 *
 * @returns `true` if running on server (Node.js, Edge), `false` if browser
 *
 * @example
 * ```ts
 * if (isServerSide()) {
 *   // Use server-side Sentry configuration
 *   Sentry.init(getBaseServerConfig());
 * }
 * ```
 */
export function isServerSide(): boolean {
  return typeof window === 'undefined';
}
