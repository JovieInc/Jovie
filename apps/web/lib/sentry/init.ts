/**
 * Sentry Initialization Factory
 *
 * This module provides the main entry point for initializing Sentry on the client side.
 * It implements a **lazy loading strategy** that determines which SDK configuration
 * to use based on the current route context.
 *
 * ## Lazy Loading Architecture
 *
 * The Sentry SDK is one of the largest JavaScript dependencies (~50-70KB gzipped).
 * This module implements a two-tier strategy to optimize performance:
 *
 * ### Tier 1: Lite SDK (~20-30KB gzipped)
 * - Used on public pages: profiles (`/[username]`), marketing, auth
 * - Includes: Core error tracking, basic breadcrumbs, performance monitoring
 * - Excludes: Session Replay (~40-50KB saved), Profiling (~10-15KB saved)
 * - **Impact**: Significantly improves Largest Contentful Paint (LCP) on public pages
 *
 * ### Tier 2: Full SDK (~60-80KB gzipped)
 * - Used on dashboard pages: `/app/*`, `/account/*`, `/billing/*`
 * - Includes: All lite features PLUS Session Replay and Profiling
 * - **Benefit**: Complete debugging capabilities for authenticated users
 *
 * ## Code Splitting Strategy
 *
 * This module uses dynamic imports (`await import()`) to ensure webpack creates
 * separate chunks for each SDK variant:
 *
 * ```
 * chunks/
 *   sentry-core.js    (~20KB) - Loaded by both variants
 *   sentry-replay.js  (~45KB) - Only loaded for dashboard pages
 * ```
 *
 * The webpack configuration in `next.config.js` enforces this split via cacheGroups.
 *
 * ## SDK Upgrade Flow
 *
 * When a user navigates from a public page to the dashboard:
 *
 * 1. User lands on `/beyonce` → Lite SDK initialized (fast LCP)
 * 2. User logs in and navigates to `/app/dashboard`
 * 3. `upgradeSentryToFull()` is called (or `SentryDashboardProvider` triggers it)
 * 4. Replay integration is dynamically imported and added to existing client
 * 5. Session recording begins (no page reload required)
 *
 * ## Route Classification
 *
 * - **DASHBOARD routes** → Full SDK: `/app`, `/account`, `/billing`, `/onboarding`, `/sso-callback`
 * - **PUBLIC routes** → Lite SDK: Everything else (profiles, marketing, auth pages)
 * - **API routes** → No SDK: Server-side only, no client initialization
 *
 * ## Usage
 *
 * ```ts
 * // Recommended: Auto-detect route and initialize
 * const result = await initSentry();
 * console.log(`Initialized in ${result.mode} mode`);
 *
 * // Synchronous initialization (lite SDK only)
 * const result = initSentrySync();
 *
 * // Upgrade to full SDK (e.g., after login)
 * await upgradeSentryToFull();
 *
 * // Check current state
 * getSentryMode();        // 'lite' | 'full' | 'none'
 * isSentryInitialized();  // boolean
 * ```
 *
 * @module lib/sentry/init
 * @see {@link ../config.ts} - Shared configuration constants
 * @see {@link ../client-lite.ts} - Lite SDK implementation
 * @see {@link ../client-full.ts} - Full SDK implementation
 * @see {@link ../route-detector.ts} - Comprehensive route detection
 * @see {@link ../lazy-replay.ts} - SDK upgrade utilities
 */

import type { FullSentryConfig } from './client-full';
import type { LiteSentryConfig } from './client-lite';

/**
 * SDK mode type representing the current Sentry configuration state.
 *
 * This type is central to the lazy loading architecture:
 * - `'lite'`: Lite SDK initialized - minimal bundle, core error tracking only
 * - `'full'`: Full SDK initialized - complete features including Session Replay
 * - `'none'`: SDK not initialized (initial state or initialization failed)
 *
 * @remarks
 * The mode is determined at initialization time based on the current route.
 * It can transition from `'lite'` to `'full'` via `upgradeSentryToFull()`,
 * but cannot transition backwards (full → lite would require page reload).
 */
export type SentryMode = 'lite' | 'full' | 'none';

/**
 * Internal state tracking for SDK mode.
 *
 * This module-level variable tracks the current SDK state across the application.
 * It's modified by initialization functions and checked by state query functions.
 *
 * State transitions:
 * - `'none'` → `'lite'`: Via `initSentry()` on public route or `initSentrySync()`
 * - `'none'` → `'full'`: Via `initSentry()` on dashboard route
 * - `'lite'` → `'full'`: Via `upgradeSentryToFull()` when navigating to dashboard
 *
 * @internal
 */
let currentMode: SentryMode = 'none';

/**
 * Route patterns that trigger full SDK initialization.
 *
 * These are authenticated/dashboard routes where complete debugging capabilities
 * (including Session Replay) are more valuable than load time optimization.
 *
 * ## Rationale for Full SDK Routes
 *
 * Dashboard routes have different performance/debugging tradeoffs:
 * - Users are already authenticated (not a first impression)
 * - Complex interactions that benefit from Session Replay
 * - Higher value debugging for paid user issues
 * - Page load time is less critical than public pages
 *
 * @remarks
 * For comprehensive route detection with edge case handling, see `route-detector.ts`.
 * This module uses a simplified list for the factory function's basic operation.
 *
 * @see {@link ../route-detector.ts} - Full route classification system
 */
const DASHBOARD_ROUTE_PREFIXES = [
  '/app', // Main dashboard and all nested routes
  '/account', // Account management (settings, profile)
  '/billing', // Billing and subscription management
  '/onboarding', // User onboarding flow
  '/sso-callback', // SSO authentication callback
] as const;

/**
 * Routes that are explicitly public (use lite SDK).
 *
 * These routes prioritize fast page load over debugging features:
 * - First impressions for new users (SEO-critical pages)
 * - High-traffic pages that benefit from optimal LCP
 * - Public-facing content where Session Replay is less valuable
 *
 * @remarks
 * Routes not in this list or DASHBOARD_ROUTE_PREFIXES default to lite SDK
 * as a performance-first approach. This includes dynamic username routes
 * like `/beyonce` which are treated as public profile pages.
 */
const PUBLIC_ROUTE_PREFIXES = [
  '/', // Home page (exact match handled separately)
  '/artists', // Artists directory - high SEO value
  '/waitlist', // Waitlist signup - conversion-critical
  '/claim', // Claim profile page
  '/go', // Short link redirects (performance-critical)
  '/r', // Short link redirects (alternative)
  '/out', // Outbound link tracking
] as const;

/**
 * Next.js App Router route groups that are public.
 *
 * Route groups use parentheses in the filesystem but are stripped from URLs.
 * This list handles edge cases where route group syntax might appear in paths.
 *
 * @remarks
 * In practice, route groups don't appear in browser URLs, but this list
 * documents the public page structure for code clarity.
 */
const PUBLIC_ROUTE_GROUPS = [
  '(auth)', // Auth pages (login, signup, password reset)
  '(marketing)', // Marketing pages (about, pricing, blog)
  '(dynamic)', // Dynamic content (legal pages, terms, privacy)
] as const;

/**
 * Options for the Sentry initialization factory.
 *
 * These options control how `initSentry()` determines which SDK variant to load
 * and how each variant is configured.
 *
 * @example
 * ```ts
 * // Override automatic route detection
 * await initSentry({ forceMode: 'full' });
 *
 * // Custom sample rates for lite SDK
 * await initSentry({
 *   liteOptions: { tracesSampleRate: 0.05 }
 * });
 *
 * // Testing with a specific pathname
 * await initSentry({ pathname: '/app/dashboard' });
 * ```
 */
export interface SentryInitOptions {
  /**
   * Force a specific SDK mode regardless of route detection.
   *
   * Use cases:
   * - `'full'`: Force full SDK for testing Session Replay
   * - `'lite'`: Force lite SDK even on dashboard (e.g., performance testing)
   * - `'none'`: Skip initialization entirely
   *
   * @remarks
   * In the lazy loading architecture, forcing a mode bypasses the automatic
   * route detection but still uses dynamic imports for code splitting.
   */
  forceMode?: SentryMode;

  /**
   * Configuration options passed to the lite SDK initialization.
   *
   * These options extend the base configuration for public pages.
   * See `LiteSentryConfig` for available options.
   *
   * @see {@link LiteSentryConfig}
   */
  liteOptions?: LiteSentryConfig;

  /**
   * Configuration options passed to the full SDK initialization.
   *
   * These options extend the base configuration for dashboard pages.
   * See `FullSentryConfig` for available options including Replay settings.
   *
   * @see {@link FullSentryConfig}
   */
  fullOptions?: FullSentryConfig;

  /**
   * Override the pathname used for route detection.
   *
   * By default, uses `window.location.pathname`. Override this for:
   * - Unit testing with specific routes
   * - Server-side rendering where window is unavailable
   * - Programmatic SDK mode selection
   */
  pathname?: string;
}

/**
 * Result of Sentry initialization.
 *
 * This interface provides feedback about which SDK variant was loaded and
 * whether initialization succeeded. Use this to:
 * - Log SDK state for debugging
 * - Conditionally show error reporting UI
 * - Track SDK variant in analytics
 *
 * @example
 * ```ts
 * const result = await initSentry();
 *
 * if (result.success) {
 *   console.log(`Sentry initialized in ${result.mode} mode`);
 * } else {
 *   console.warn('Sentry init failed:', result.error);
 * }
 * ```
 */
export interface SentryInitResult {
  /**
   * Whether initialization was successful.
   *
   * `false` can mean:
   * - DSN not configured (expected in development)
   * - SDK already initialized (idempotent, not an error)
   * - Initialization threw an exception
   */
  success: boolean;

  /**
   * The SDK mode after initialization.
   *
   * - `'lite'`: Core SDK loaded (public pages)
   * - `'full'`: Full SDK with Replay loaded (dashboard pages)
   * - `'none'`: SDK not initialized (error or skipped)
   */
  mode: SentryMode;

  /**
   * Error message if initialization failed.
   *
   * Common error scenarios:
   * - "DSN not configured" - No NEXT_PUBLIC_SENTRY_DSN environment variable
   * - "Already initialized" - SDK was already set up (safe to ignore)
   * - Exception message - Unexpected error during initialization
   */
  error?: string;
}

/**
 * Determines if a given pathname should use the dashboard (full) SDK.
 *
 * @param pathname - The URL pathname to check
 * @returns true if the route should use the full SDK
 *
 * @example
 * isDashboardRoute('/app/dashboard') // true
 * isDashboardRoute('/artists/beyonce') // false
 */
export function isDashboardRoute(pathname: string): boolean {
  // Normalize pathname
  const normalizedPath = pathname.toLowerCase();

  // Check against dashboard route prefixes
  for (const prefix of DASHBOARD_ROUTE_PREFIXES) {
    if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines if a given pathname should use the public (lite) SDK.
 *
 * @param pathname - The URL pathname to check
 * @returns true if the route should use the lite SDK
 *
 * @example
 * isPublicRoute('/') // true
 * isPublicRoute('/artists/beyonce') // true
 * isPublicRoute('/app/dashboard') // false
 */
export function isPublicRoute(pathname: string): boolean {
  // Normalize pathname
  const normalizedPath = pathname.toLowerCase();

  // Home page is public
  if (normalizedPath === '/') {
    return true;
  }

  // Check against explicit public route prefixes
  for (const prefix of PUBLIC_ROUTE_PREFIXES) {
    if (normalizedPath.startsWith(`${prefix}/`) || normalizedPath === prefix) {
      return true;
    }
  }

  // Check for route groups in the path (edge case for direct navigation)
  // Note: Route groups typically don't appear in the URL, but this handles
  // cases where they might be exposed
  for (const group of PUBLIC_ROUTE_GROUPS) {
    if (
      normalizedPath.includes(`/${group}/`) ||
      normalizedPath.includes(`/${group}`)
    ) {
      return true;
    }
  }

  // Username routes (e.g., /beyonce, /taylor-swift)
  // These are public profile pages - any single-segment path that's not
  // a known dashboard route is likely a username
  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.length >= 1) {
    const firstSegment = segments[0];
    // If not a known dashboard prefix, treat as public (likely a username)
    const isKnownDashboardPrefix = DASHBOARD_ROUTE_PREFIXES.some(
      prefix =>
        prefix === `/${firstSegment}` || prefix.startsWith(`/${firstSegment}/`)
    );
    if (!isKnownDashboardPrefix) {
      return true;
    }
  }

  return false;
}

/**
 * Determines the appropriate SDK mode for a given pathname.
 *
 * Priority:
 * 1. Dashboard routes → 'full'
 * 2. Public routes → 'lite'
 * 3. Unknown routes → 'lite' (safe default for performance)
 *
 * @param pathname - The URL pathname to check
 * @returns The recommended SDK mode
 */
export function detectSentryMode(pathname: string): 'lite' | 'full' {
  if (isDashboardRoute(pathname)) {
    return 'full';
  }
  // Default to lite for public and unknown routes (performance-first)
  return 'lite';
}

/**
 * Gets the current pathname from the window object.
 * Returns '/' if not in a browser environment.
 */
function getCurrentPathname(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return window.location.pathname;
}

/**
 * Initializes Sentry with the appropriate SDK variant based on route context.
 *
 * This is the main factory function that should be called during app initialization.
 * It automatically detects the current route and loads the appropriate SDK variant:
 * - Lite SDK for public pages (faster LCP, no Replay)
 * - Full SDK for dashboard pages (complete features, includes Replay)
 *
 * @param options - Configuration options
 * @returns The initialization result
 *
 * @example
 * // Auto-detect route and initialize
 * const result = await initSentry();
 * console.log(`Initialized Sentry in ${result.mode} mode`);
 *
 * @example
 * // Force full SDK for testing
 * const result = await initSentry({ forceMode: 'full' });
 *
 * @example
 * // With custom options
 * const result = await initSentry({
 *   fullOptions: { replaysSessionSampleRate: 0.05 }
 * });
 */
export async function initSentry(
  options: SentryInitOptions = {}
): Promise<SentryInitResult> {
  const { forceMode, liteOptions = {}, fullOptions = {}, pathname } = options;

  // If already initialized, return current state
  if (currentMode !== 'none') {
    return {
      success: true,
      mode: currentMode,
    };
  }

  // Determine the mode to use
  const currentPathname = pathname ?? getCurrentPathname();
  const mode = forceMode ?? detectSentryMode(currentPathname);

  if (mode === 'none') {
    return {
      success: false,
      mode: 'none',
      error: 'Sentry initialization skipped (mode: none)',
    };
  }

  try {
    if (mode === 'lite') {
      // Dynamically import lite client to enable code splitting
      const { initLiteSentry } = await import('./client-lite');
      const success = initLiteSentry(liteOptions);

      if (success) {
        currentMode = 'lite';
        return { success: true, mode: 'lite' };
      } else {
        return {
          success: false,
          mode: 'none',
          error:
            'Lite Sentry initialization failed (possibly already initialized or no DSN)',
        };
      }
    } else {
      // Dynamically import full client to enable code splitting
      // Use async version for lazy Replay loading
      const { initFullSentryAsync } = await import('./client-full');
      const success = await initFullSentryAsync(fullOptions);

      if (success) {
        currentMode = 'full';
        return { success: true, mode: 'full' };
      } else {
        return {
          success: false,
          mode: 'none',
          error:
            'Full Sentry initialization failed (possibly already initialized or no DSN)',
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      mode: 'none',
      error: `Sentry initialization error: ${errorMessage}`,
    };
  }
}

/**
 * Synchronous version of initSentry for use cases where async is not suitable.
 * This function only works for the lite SDK (full SDK requires async for lazy loading).
 *
 * For dashboard routes, this function will initialize the lite SDK and return
 * a warning. Call `upgradeSentryToFull()` afterward to load full features.
 *
 * @param options - Configuration options
 * @returns The initialization result
 */
export function initSentrySync(
  options: Omit<SentryInitOptions, 'fullOptions'> = {}
): SentryInitResult {
  const { forceMode, liteOptions = {}, pathname } = options;

  // If already initialized, return current state
  if (currentMode !== 'none') {
    return {
      success: true,
      mode: currentMode,
    };
  }

  // Determine the mode to use
  const currentPathname = pathname ?? getCurrentPathname();
  const detectedMode = forceMode ?? detectSentryMode(currentPathname);

  if (detectedMode === 'none') {
    return {
      success: false,
      mode: 'none',
      error: 'Sentry initialization skipped (mode: none)',
    };
  }

  // For sync initialization, we always use lite SDK
  // If full mode was requested, it will be upgraded later
  const { initLiteSentry } = require('./client-lite');
  const success = initLiteSentry(liteOptions);

  if (success) {
    currentMode = 'lite';

    if (detectedMode === 'full') {
      return {
        success: true,
        mode: 'lite',
        error:
          'Initialized in lite mode. Call upgradeSentryToFull() for full features.',
      };
    }

    return { success: true, mode: 'lite' };
  }

  return {
    success: false,
    mode: 'none',
    error: 'Lite Sentry initialization failed',
  };
}

/**
 * Upgrades the current Sentry SDK from lite to full mode.
 *
 * This is useful when a user navigates from a public page to the dashboard.
 * It adds the Replay integration to the existing SDK without re-initialization.
 *
 * @returns Promise<boolean> - true if upgrade was successful
 *
 * @example
 * // In a dashboard layout component
 * useEffect(() => {
 *   if (getSentryMode() === 'lite') {
 *     upgradeSentryToFull();
 *   }
 * }, []);
 */
export async function upgradeSentryToFull(): Promise<boolean> {
  if (currentMode === 'full') {
    // Already in full mode
    return true;
  }

  if (currentMode === 'none') {
    // SDK not initialized yet, initialize in full mode
    const result = await initSentry({ forceMode: 'full' });
    return result.success;
  }

  // SDK is in lite mode, add Replay integration
  try {
    const { addReplayIntegration } = await import('./client-full');
    const success = await addReplayIntegration();

    if (success) {
      currentMode = 'full';
    }

    return success;
  } catch {
    return false;
  }
}

/**
 * Gets the current Sentry SDK mode.
 *
 * This is the primary way to check which SDK variant is active. Use this for:
 * - Conditional feature behavior based on SDK capabilities
 * - Tagging errors with SDK mode for Sentry dashboard filtering
 * - Debugging SDK initialization issues
 *
 * @returns The current SDK mode: `'lite'`, `'full'`, or `'none'`
 *
 * @example
 * ```ts
 * const mode = getSentryMode();
 *
 * if (mode === 'full') {
 *   // Session Replay is available
 * } else if (mode === 'lite') {
 *   // Core error tracking only
 * } else {
 *   // SDK not initialized
 * }
 * ```
 *
 * @see {@link isSentryInitialized} - Check if any SDK is active
 * @see {@link isFullModeActive} - Check specifically for full SDK
 * @see {@link isLiteModeActive} - Check specifically for lite SDK
 */
export function getSentryMode(): SentryMode {
  return currentMode;
}

/**
 * Checks if Sentry has been initialized in any mode.
 *
 * This is a convenience function for checking if error tracking is available,
 * regardless of which SDK variant is active.
 *
 * @returns `true` if SDK is initialized (lite or full), `false` if not
 *
 * @example
 * ```ts
 * if (isSentryInitialized()) {
 *   Sentry.captureException(error);
 * } else {
 *   // Fallback: log to console or alternative error service
 *   console.error('Error (Sentry not available):', error);
 * }
 * ```
 *
 * @see {@link lib/error-tracking.ts} - Uses this for safe error capture
 */
export function isSentryInitialized(): boolean {
  return currentMode !== 'none';
}

/**
 * Checks if Sentry is running in full mode with Session Replay.
 *
 * Use this to conditionally enable features that depend on Session Replay,
 * or to verify that the SDK upgrade from lite to full succeeded.
 *
 * @returns `true` if full SDK is active with Replay capabilities
 *
 * @example
 * ```ts
 * if (isFullModeActive()) {
 *   // Session Replay is recording - can reference replay links
 * }
 * ```
 */
export function isFullModeActive(): boolean {
  return currentMode === 'full';
}

/**
 * Checks if Sentry is running in lite mode.
 *
 * This is useful for:
 * - Checking if SDK can be upgraded to full mode
 * - Verifying that public pages loaded the lightweight SDK
 * - Debugging SDK mode selection
 *
 * @returns `true` if lite SDK is active (no Replay)
 *
 * @example
 * ```ts
 * if (isLiteModeActive()) {
 *   // Can upgrade to full mode if user navigates to dashboard
 *   console.log('Lite SDK active - Replay not available');
 * }
 * ```
 */
export function isLiteModeActive(): boolean {
  return currentMode === 'lite';
}

/**
 * Resets the Sentry mode state tracking.
 *
 * **⚠️ WARNING**: This function is intended for testing only.
 *
 * This does NOT uninitialize the Sentry SDK - it only resets the internal
 * `currentMode` variable. The actual Sentry client remains initialized and
 * will continue to capture errors.
 *
 * ## Why This Exists
 *
 * In unit tests, we need to test different SDK initialization paths without
 * restarting the test runner. This function allows tests to:
 * - Simulate first-time initialization
 * - Test both lite and full SDK paths in the same test file
 * - Verify state tracking logic
 *
 * ## Usage in Tests
 *
 * ```ts
 * beforeEach(() => {
 *   _resetSentryModeForTesting();
 * });
 *
 * it('should initialize in lite mode for public routes', async () => {
 *   const result = await initSentry({ pathname: '/beyonce' });
 *   expect(result.mode).toBe('lite');
 * });
 * ```
 *
 * @internal - Do not use outside of test files
 */
export function _resetSentryModeForTesting(): void {
  currentMode = 'none';
}
