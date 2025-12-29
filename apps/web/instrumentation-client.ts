/**
 * Sentry Client Instrumentation - Route-Based SDK Loading
 *
 * This file configures the initialization of Sentry on the client with intelligent
 * SDK variant selection based on the current route:
 *
 * - Public pages (/, /artists, /[username], etc.): Lite SDK for faster LCP
 *   - Core error tracking only (~20-30KB gzipped)
 *   - No Replay, no Profiling
 *
 * - Dashboard pages (/app, /account, /billing, etc.): Full SDK with all features
 *   - Session Replay (~40-50KB gzipped)
 *   - Complete debugging capabilities
 *
 * Dynamic imports are used to enable webpack code splitting, ensuring only the
 * necessary SDK variant is loaded for each page.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 *
 * PII Collection Notice:
 * When sendDefaultPii is enabled, Sentry may collect:
 * - User IP addresses (anonymized via beforeSend)
 * - User IDs (Clerk user IDs only, no emails)
 *
 * This data is used for error debugging and is retained per Sentry's data retention policy.
 * Users can request data deletion via privacy@jov.ie.
 */

import { captureRouterTransitionStart } from '@sentry/nextjs';
import { getSdkMode, isApiRoute } from './lib/sentry/route-detector';

/**
 * Export the router transition capture for Next.js App Router.
 * This is used by Next.js to track client-side navigation.
 */
export const onRouterTransitionStart = captureRouterTransitionStart;

/**
 * Initialize Sentry with the appropriate SDK variant based on the current route.
 *
 * This uses dynamic imports to enable code splitting:
 * - Public routes load client-lite.ts (~20-30KB)
 * - Dashboard routes load client-full.ts with Replay (~60-80KB total)
 *
 * The initialization is wrapped in an IIFE to allow async/await while keeping
 * the module synchronously exportable.
 */
(async function initializeSentryClient(): Promise<void> {
  // Skip initialization if not in a browser environment
  if (typeof window === 'undefined') {
    return;
  }

  // Get the current pathname to determine SDK mode
  const pathname = window.location.pathname;

  // Skip initialization for API routes (handled server-side)
  if (isApiRoute(pathname)) {
    return;
  }

  // Determine which SDK mode to use based on the route
  const sdkMode = getSdkMode(pathname);

  if (sdkMode === 'none') {
    // This shouldn't happen for client routes, but handle gracefully
    return;
  }

  try {
    if (sdkMode === 'full') {
      // Dashboard routes: Load full SDK with Replay
      // Dynamic import enables webpack to create a separate chunk
      const { initFullSentryAsync } = await import('./lib/sentry/client-full');
      await initFullSentryAsync();
    } else {
      // Public routes: Load lite SDK for better LCP
      // Dynamic import enables webpack to create a separate chunk
      const { initLiteSentry } = await import('./lib/sentry/client-lite');
      initLiteSentry();
    }
  } catch (error) {
    // Silently fail Sentry initialization to avoid breaking the app
    // In production, this would be caught by the global error handler
    if (process.env.NODE_ENV === 'development') {
      console.error('[Sentry] Failed to initialize SDK:', error);
    }
  }
})();
