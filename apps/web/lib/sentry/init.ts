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
 *
 * ### Tier 2: Full SDK (~60-80KB gzipped)
 * - Used on dashboard pages: `/app/*`, `/account/*`, `/billing/*`
 * - Includes: All lite features PLUS Session Replay and Profiling
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
 * @see {@link ./config.ts} - Shared configuration constants
 * @see {@link ./client-lite.ts} - Lite SDK implementation
 * @see {@link ./client-full.ts} - Full SDK implementation
 * @see {@link ./route-detector.ts} - Comprehensive route detection
 * @see {@link ./state.ts} - SDK state management
 */

import type { FullSentryConfig } from './client-full';
import type { LiteSentryConfig } from './client-lite';
import { getCurrentPathname, getSdkMode } from './route-detector';
import {
  getSentryMode,
  isFullModeActive,
  isSentryInitialized,
  type SentryMode,
  setCurrentMode,
} from './state';

// Re-export route detection functions for backwards compatibility
export { isDashboardRoute, isPublicRoute } from './route-detector';
// Re-export state functions for backwards compatibility
export {
  _resetSentryModeForTesting,
  getSentryMode,
  isFullModeActive,
  isLiteModeActive,
  isSentryInitialized,
  type SentryMode,
} from './state';

/**
 * Options for the Sentry initialization factory.
 *
 * These options control how `initSentry()` determines which SDK variant to load
 * and how each variant is configured.
 */
export interface SentryInitOptions {
  /**
   * Force a specific SDK mode regardless of route detection.
   *
   * Use cases:
   * - `'full'`: Force full SDK for testing Session Replay
   * - `'lite'`: Force lite SDK even on dashboard (e.g., performance testing)
   * - `'none'`: Skip initialization entirely
   */
  forceMode?: SentryMode;

  /**
   * Configuration options passed to the lite SDK initialization.
   *
   * @see {@link LiteSentryConfig}
   */
  liteOptions?: LiteSentryConfig;

  /**
   * Configuration options passed to the full SDK initialization.
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
 */
export interface SentryInitResult {
  /**
   * Whether initialization was successful.
   */
  success: boolean;

  /**
   * The SDK mode after initialization.
   */
  mode: SentryMode;

  /**
   * Error message if initialization failed.
   */
  error?: string;
}

/**
 * Determines the appropriate SDK mode for a given pathname.
 *
 * @param pathname - The URL pathname to check
 * @returns The recommended SDK mode
 */
export function detectSentryMode(pathname: string): 'lite' | 'full' {
  const mode = getSdkMode(pathname);
  // getSdkMode can return 'none' for API routes, but we default to 'lite' here
  return mode === 'none' ? 'lite' : mode;
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
 */
export async function initSentry(
  options: SentryInitOptions = {}
): Promise<SentryInitResult> {
  const { forceMode, liteOptions = {}, fullOptions = {}, pathname } = options;

  // If already initialized, return current state
  if (getSentryMode() !== 'none') {
    return {
      success: true,
      mode: getSentryMode(),
    };
  }

  // Determine the mode to use
  const currentPathname = pathname ?? getCurrentPathname() ?? '/';
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
        setCurrentMode('lite');
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
      const { initFullSentryAsync } = await import('./client-full');
      const success = await initFullSentryAsync(fullOptions);

      if (success) {
        setCurrentMode('full');
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
 * @param options - Configuration options
 * @returns The initialization result
 */
export function initSentrySync(
  options: Omit<SentryInitOptions, 'fullOptions'> = {}
): SentryInitResult {
  const { forceMode, liteOptions = {}, pathname } = options;

  // If already initialized, return current state
  if (getSentryMode() !== 'none') {
    return {
      success: true,
      mode: getSentryMode(),
    };
  }

  // Determine the mode to use
  const currentPathname = pathname ?? getCurrentPathname() ?? '/';
  const detectedMode = forceMode ?? detectSentryMode(currentPathname);

  if (detectedMode === 'none') {
    return {
      success: false,
      mode: 'none',
      error: 'Sentry initialization skipped (mode: none)',
    };
  }

  // For sync initialization, we always use lite SDK
  const { initLiteSentry } = require('./client-lite');
  const success = initLiteSentry(liteOptions);

  if (success) {
    setCurrentMode('lite');

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
 */
export async function upgradeSentryToFull(): Promise<boolean> {
  if (isFullModeActive()) {
    // Already in full mode
    return true;
  }

  if (!isSentryInitialized()) {
    // SDK not initialized yet, initialize in full mode
    const result = await initSentry({ forceMode: 'full' });
    return result.success;
  }

  // SDK is in lite mode, add Replay integration
  try {
    const { addReplayIntegration } = await import('./client-full');
    const success = await addReplayIntegration();

    if (success) {
      setCurrentMode('full');
    }

    return success;
  } catch {
    return false;
  }
}
