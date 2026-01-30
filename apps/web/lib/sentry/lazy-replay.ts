/**
 * Lazy Replay Loader
 *
 * This module provides utilities for lazy loading the Sentry Replay integration
 * when a user navigates from a public page (with lite SDK) to a dashboard page
 * (which requires full SDK with Replay).
 *
 * The primary use case is:
 * 1. User lands on a public profile page (e.g., /beyonce)
 * 2. Lite SDK is loaded for optimal LCP performance
 * 3. User logs in and navigates to dashboard (/app)
 * 4. This module upgrades the SDK to include Replay without page reload
 *
 * Usage:
 * - Use `useLazyReplayUpgrade()` hook in dashboard layouts
 * - Use `setupNavigationUpgrade()` for imperative setup
 * - Use `checkAndUpgradeOnNavigation()` for manual upgrade checks
 *
 * @module lib/sentry/lazy-replay
 */

import type { SentryMode } from './init';
import {
  getCurrentPathname,
  getSdkMode,
  isDashboardRoute,
} from './route-detector';

/**
 * Upgrade state enum for tracking the upgrade process
 */
export type UpgradeState =
  | 'idle' // Not started
  | 'checking' // Checking if upgrade is needed
  | 'upgrading' // Upgrade in progress
  | 'completed' // Successfully upgraded
  | 'already-full' // Was already in full mode
  | 'skipped' // Not a dashboard route, no upgrade needed
  | 'failed'; // Upgrade failed

/**
 * Result of an upgrade operation
 */
export interface UpgradeResult {
  /**
   * Whether the upgrade was successful or not needed
   */
  success: boolean;

  /**
   * The current state after the upgrade attempt
   */
  state: UpgradeState;

  /**
   * The previous SDK mode before upgrade
   */
  previousMode: SentryMode;

  /**
   * The current SDK mode after upgrade
   */
  currentMode: SentryMode;

  /**
   * Any error message if the upgrade failed
   */
  error?: string;
}

/**
 * Options for the navigation upgrade setup
 */
export interface NavigationUpgradeOptions {
  /**
   * Callback when upgrade starts
   */
  onUpgradeStart?: () => void;

  /**
   * Callback when upgrade completes successfully
   */
  onUpgradeComplete?: () => void;

  /**
   * Callback when upgrade fails
   */
  onUpgradeFailed?: (error: Error) => void;

  /**
   * Debounce time in milliseconds to prevent multiple rapid upgrades
   * Default: 100ms
   */
  debounceMs?: number;
}

/**
 * Internal state for tracking upgrade status
 */
let upgradeState: UpgradeState = 'idle';
let upgradePromise: Promise<UpgradeResult> | null = null;

/**
 * Gets the current upgrade state
 *
 * @returns The current upgrade state
 */
export function getUpgradeState(): UpgradeState {
  return upgradeState;
}

/**
 * Checks if an upgrade is currently in progress
 *
 * @returns true if upgrade is in progress
 */
export function isUpgrading(): boolean {
  return upgradeState === 'checking' || upgradeState === 'upgrading';
}

/**
 * Checks if the SDK has been upgraded to full mode
 *
 * @returns true if SDK is in full mode
 */
export function isUpgraded(): boolean {
  return upgradeState === 'completed' || upgradeState === 'already-full';
}

/**
 * Resets the upgrade state. Primarily for testing.
 *
 * @internal
 */
export function _resetUpgradeStateForTesting(): void {
  upgradeState = 'idle';
  upgradePromise = null;
}

/**
 * Performs the actual SDK upgrade from lite to full mode.
 * This is an internal function that handles the upgrade logic.
 *
 * @returns Promise resolving to the upgrade result
 */
async function performUpgrade(): Promise<UpgradeResult> {
  // Import the init module to get current mode and upgrade function
  const { getSentryMode, upgradeSentryToFull } = await import('./init');

  const previousMode = getSentryMode();

  // If already in full mode, no upgrade needed
  if (previousMode === 'full') {
    upgradeState = 'already-full';
    return {
      success: true,
      state: 'already-full',
      previousMode,
      currentMode: 'full',
    };
  }

  // If not initialized, upgrade will initialize in full mode
  if (previousMode === 'none') {
    upgradeState = 'upgrading';

    try {
      const success = await upgradeSentryToFull();
      const currentMode = getSentryMode();

      if (success) {
        upgradeState = 'completed';
        return {
          success: true,
          state: 'completed',
          previousMode,
          currentMode,
        };
      } else {
        upgradeState = 'failed';
        return {
          success: false,
          state: 'failed',
          previousMode,
          currentMode,
          error: 'Failed to initialize Sentry in full mode',
        };
      }
    } catch (error) {
      upgradeState = 'failed';
      return {
        success: false,
        state: 'failed',
        previousMode,
        currentMode: getSentryMode(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Lite mode - perform upgrade
  upgradeState = 'upgrading';

  try {
    const success = await upgradeSentryToFull();
    const currentMode = getSentryMode();

    if (success) {
      upgradeState = 'completed';
      return {
        success: true,
        state: 'completed',
        previousMode,
        currentMode,
      };
    } else {
      upgradeState = 'failed';
      return {
        success: false,
        state: 'failed',
        previousMode,
        currentMode,
        error: 'Failed to add Replay integration',
      };
    }
  } catch (error) {
    upgradeState = 'failed';
    const { getSentryMode: getMode } = await import('./init');
    return {
      success: false,
      state: 'failed',
      previousMode,
      currentMode: getMode(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Checks if the current route requires the full SDK and upgrades if needed.
 *
 * This function is idempotent - calling it multiple times will not
 * trigger multiple upgrades. If an upgrade is already in progress,
 * it will return the existing upgrade promise.
 *
 * @param pathname - Optional pathname to check (defaults to current location)
 * @returns Promise resolving to the upgrade result
 *
 * @example
 * // Check and upgrade if on dashboard
 * const result = await checkAndUpgradeOnNavigation();
 * if (result.success) {
 *   console.log('SDK is now in full mode');
 * }
 *
 * @example
 * // Check specific pathname
 * const result = await checkAndUpgradeOnNavigation('/app/dashboard');
 */
export async function checkAndUpgradeOnNavigation(
  pathname?: string
): Promise<UpgradeResult> {
  // Get the current mode first
  const { getSentryMode } = await import('./init');
  const currentMode = getSentryMode();

  // Resolve the pathname
  const pathToCheck = pathname ?? getCurrentPathname() ?? '/';

  // Check if upgrade is needed for this route
  const sdkModeNeeded = getSdkMode(pathToCheck);

  // If this is not a dashboard route, no upgrade needed
  if (sdkModeNeeded !== 'full') {
    upgradeState = 'skipped';
    return {
      success: true,
      state: 'skipped',
      previousMode: currentMode,
      currentMode: currentMode,
    };
  }

  // If already upgraded, return early
  if (isUpgraded()) {
    return {
      success: true,
      state: upgradeState,
      previousMode: currentMode,
      currentMode: currentMode,
    };
  }

  // If upgrade is in progress, wait for it
  if (upgradePromise && isUpgrading()) {
    return upgradePromise;
  }

  // Start the upgrade
  upgradeState = 'checking';
  upgradePromise = performUpgrade();

  return upgradePromise;
}

/**
 * Forces an upgrade to full SDK mode regardless of the current route.
 *
 * Use this when you know you need full SDK features, for example:
 * - User has authenticated and will navigate to dashboard
 * - An important debugging session is starting
 *
 * @returns Promise resolving to the upgrade result
 *
 * @example
 * // Force upgrade after user login
 * async function handleLoginSuccess() {
 *   await forceUpgradeToFull();
 *   router.push('/app');
 * }
 */
export async function forceUpgradeToFull(): Promise<UpgradeResult> {
  const { getSentryMode } = await import('./init');
  const currentMode = getSentryMode();

  // If already upgraded, return early
  if (isUpgraded()) {
    return {
      success: true,
      state: upgradeState,
      previousMode: currentMode,
      currentMode: currentMode,
    };
  }

  // If upgrade is in progress, wait for it
  if (upgradePromise && isUpgrading()) {
    return upgradePromise;
  }

  // Start the upgrade
  upgradeState = 'checking';
  upgradePromise = performUpgrade();

  return upgradePromise;
}

/**
 * Cleanup function type for navigation subscriptions
 */
type CleanupFn = () => void;

/**
 * Sets up automatic SDK upgrade when navigating to dashboard routes.
 *
 * This function listens for browser popstate events and checks if the
 * new route requires the full SDK. If so, it triggers the upgrade.
 *
 * Note: For Next.js App Router, the SentryDashboardProvider component
 * is the preferred way to handle upgrades. This function is useful for
 * custom navigation handling or non-React contexts.
 *
 * @param options - Configuration options
 * @returns Cleanup function to remove event listeners
 *
 * @example
 * // Set up automatic upgrade
 * const cleanup = setupNavigationUpgrade({
 *   onUpgradeComplete: () => console.log('Upgraded to full SDK'),
 * });
 *
 * // Later, clean up when no longer needed
 * cleanup();
 */
export function setupNavigationUpgrade(
  options: NavigationUpgradeOptions = {}
): CleanupFn {
  const {
    onUpgradeStart,
    onUpgradeComplete,
    onUpgradeFailed,
    debounceMs = 100,
  } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleNavigation = (): void => {
    // Clear any pending debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce the upgrade check
    debounceTimer = setTimeout(async () => {
      const pathname = getCurrentPathname();
      if (!pathname) return;

      // Only upgrade for dashboard routes
      if (!isDashboardRoute(pathname)) {
        return;
      }

      // Check if already in full mode
      const { getSentryMode } = await import('./init');
      if (getSentryMode() === 'full') {
        return;
      }

      onUpgradeStart?.();

      try {
        const result = await checkAndUpgradeOnNavigation(pathname);

        if (result.success) {
          onUpgradeComplete?.();
        } else if (result.error) {
          onUpgradeFailed?.(new Error(result.error));
        }
      } catch (error) {
        onUpgradeFailed?.(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }, debounceMs);
  };

  // Listen for popstate (back/forward navigation)
  if (typeof window !== 'undefined') {
    globalThis.addEventListener('popstate', handleNavigation);
  }

  // Return cleanup function
  return (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (typeof window !== 'undefined') {
      globalThis.removeEventListener('popstate', handleNavigation);
    }
  };
}

/**
 * Checks if Replay integration is active.
 * This is a convenience function that combines checking the SDK mode
 * and the Replay integration status.
 *
 * @returns Promise resolving to true if Replay is active
 */
export async function isReplayActive(): Promise<boolean> {
  try {
    const { getSentryMode } = await import('./init');
    const { isReplayEnabled } = await import('./client-full');

    const mode = getSentryMode();
    return mode === 'full' && isReplayEnabled();
  } catch {
    return false;
  }
}

/**
 * Gets detailed information about the current Sentry SDK state.
 * Useful for debugging and monitoring.
 *
 * @returns Promise resolving to SDK state information
 */
export async function getSdkStateInfo(): Promise<{
  mode: SentryMode;
  isUpgraded: boolean;
  upgradeState: UpgradeState;
  isReplayActive: boolean;
  currentRoute: string | undefined;
  routeRequiresFullSdk: boolean;
}> {
  const { getSentryMode } = await import('./init');
  const mode = getSentryMode();
  const pathname = getCurrentPathname();

  return {
    mode,
    isUpgraded: isUpgraded(),
    upgradeState: getUpgradeState(),
    isReplayActive: await isReplayActive(),
    currentRoute: pathname,
    routeRequiresFullSdk: pathname ? getSdkMode(pathname) === 'full' : false,
  };
}
