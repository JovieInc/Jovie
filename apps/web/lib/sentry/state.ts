/**
 * Sentry State Management
 *
 * This module manages the internal state of the Sentry SDK initialization.
 * It tracks whether the SDK is initialized and in which mode (lite or full).
 *
 * @module lib/sentry/state
 */

/**
 * SDK mode type representing the current Sentry configuration state.
 *
 * - `'lite'`: Lite SDK initialized - minimal bundle, core error tracking only
 * - `'full'`: Full SDK initialized - complete features including Session Replay
 * - `'none'`: SDK not initialized (initial state or initialization failed)
 */
export type SentryMode = 'lite' | 'full' | 'none';

/**
 * Internal state tracking for SDK mode.
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
 * Sets the current Sentry SDK mode.
 *
 * @param mode - The mode to set
 * @internal
 */
export function setCurrentMode(mode: SentryMode): void {
  currentMode = mode;
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
 */
export function isLiteModeActive(): boolean {
  return currentMode === 'lite';
}

/**
 * Resets the Sentry mode state tracking.
 *
 * **WARNING**: This function is intended for testing only.
 *
 * This does NOT uninitialize the Sentry SDK - it only resets the internal
 * `currentMode` variable.
 *
 * @internal - Do not use outside of test files
 */
export function _resetSentryModeForTesting(): void {
  currentMode = 'none';
}
