/**
 * Sentry utilities barrel export
 *
 * Provides centralized access to Sentry instrumentation utilities for the Jovie application.
 * This module supports two SDK variants for optimal performance:
 *
 * - **Lite SDK**: Core error tracking only, used on public pages for faster LCP
 * - **Full SDK**: Complete features including Session Replay, used on dashboard pages
 *
 * ## Quick Start
 *
 * For most use cases, use the factory function:
 * ```ts
 * import { initSentry, getSentryMode } from '@/lib/sentry';
 *
 * // Auto-detect route and initialize appropriate SDK variant
 * await initSentry();
 *
 * // Check current mode
 * console.log(getSentryMode()); // 'lite' | 'full' | 'none'
 * ```
 *
 * ## Route Detection
 *
 * ```ts
 * import { getSdkMode, isDashboardRoute, isPublicRoute } from '@/lib/sentry';
 *
 * getSdkMode('/app/dashboard');  // 'full'
 * getSdkMode('/beyonce');        // 'lite'
 * isDashboardRoute('/app');      // true
 * isPublicRoute('/artists');     // true
 * ```
 *
 * ## SDK Upgrade (lite → full)
 *
 * ```ts
 * import { upgradeSentryToFull, checkAndUpgradeOnNavigation } from '@/lib/sentry';
 *
 * // Upgrade when navigating to dashboard
 * await checkAndUpgradeOnNavigation('/app/dashboard');
 *
 * // Or force upgrade (e.g., after login)
 * await upgradeSentryToFull();
 * ```
 *
 * @module lib/sentry
 */

// =============================================================================
// Existing utilities (backwards compatible)
// =============================================================================

/**
 * API Route utilities for wrapping handlers with Sentry instrumentation
 */
export {
  captureApiError,
  withApiSpan,
  withSentryApiRoute,
} from './api-wrapper';

/**
 * Server-side Sentry initialization helper
 */
export { ensureSentry } from './ensure';

// =============================================================================
// Configuration utilities
// =============================================================================

export type { BaseSentryClientConfig, BaseSentryServerConfig } from './config';
/**
 * Shared configuration constants, sample rates, and PII scrubbing utilities.
 * Use these for custom SDK configurations or extending base configs.
 */
export {
  createBeforeSendHook,
  // Base configuration factories
  getBaseClientConfig,
  getBaseServerConfig,
  // Runtime detection
  isClientSide,
  isDevelopment,
  // Environment detection
  isProduction,
  isServerSide,
  REPLAY_ERROR_SAMPLE_RATE,
  REPLAY_SESSION_SAMPLE_RATE,
  // Security
  SENSITIVE_HEADERS,
  // DSN configuration
  SENTRY_DSN_CLIENT,
  SENTRY_DSN_SERVER,
  scrubPii,
  // Sample rates
  TRACES_SAMPLE_RATE,
} from './config';

// =============================================================================
// SDK Initialization (Primary API)
// =============================================================================

export type {
  SentryInitOptions,
  SentryInitResult,
  SentryMode,
} from './init';
/**
 * Main SDK initialization factory and state management.
 * This is the primary API for initializing Sentry.
 */
export {
  // Route detection (basic - use route-detector for comprehensive detection)
  detectSentryMode,
  // State tracking
  getSentryMode,
  // Factory functions
  initSentry,
  initSentrySync,
  isFullModeActive,
  isLiteModeActive,
  isSentryInitialized,
  // SDK upgrade (lite → full)
  upgradeSentryToFull,
} from './init';

// =============================================================================
// Route Detection
// =============================================================================

export type { RouteClassification, RouteType } from './route-detector';
/**
 * Comprehensive route detection utilities for determining SDK mode requirements.
 * Use these to classify routes and determine if full or lite SDK is needed.
 */
export {
  // Comprehensive classification
  classifyRoute,
  getCurrentPathname,
  getCurrentRouteClassification,
  getSdkMode,
  // Pattern detection
  hasDynamicSegments,
  // Route classification predicates
  isApiRoute,
  isDashboardRoute,
  isExplicitPublicRoute,
  isProfileRoute,
  isPublicRoute,
  isRouteGroupPath,
  // Pathname utilities
  normalizePathname,
  // Configuration export
  ROUTE_CONFIG,
  // Convenience predicates
  shouldUseFullSdk,
  shouldUseLiteSdk,
} from './route-detector';

// =============================================================================
// Lite SDK (Public Pages)
// =============================================================================

export type { LiteSentryConfig } from './client-lite';
/**
 * Lite SDK for public pages - core error tracking without Replay/Profiling.
 * Approximately 20-30KB gzipped, optimized for LCP performance.
 */
export {
  getLiteClientConfig,
  initLiteSentry,
  isLiteSentryInitialized,
} from './client-lite';

// =============================================================================
// Full SDK (Dashboard Pages)
// =============================================================================

export type { FullSentryConfig } from './client-full';
/**
 * Full SDK for dashboard pages - includes Session Replay and all features.
 * Approximately 60-80KB gzipped, prioritizes debugging capabilities.
 */
export {
  addReplayIntegration,
  getFullClientConfig,
  initFullSentry,
  initFullSentryAsync,
  isFullSentryInitialized,
  isReplayEnabled,
} from './client-full';

// =============================================================================
// Lazy Replay Loading
// =============================================================================

export type {
  NavigationUpgradeOptions,
  UpgradeResult,
  UpgradeState,
} from './lazy-replay';
/**
 * Utilities for lazy loading Replay integration when navigating from
 * public pages (lite SDK) to dashboard pages (full SDK).
 */
export {
  // Upgrade functions
  checkAndUpgradeOnNavigation,
  forceUpgradeToFull,
  getSdkStateInfo,
  // State tracking
  getUpgradeState,
  // Status utilities
  isReplayActive,
  isUpgraded,
  isUpgrading,
  // Navigation event handling
  setupNavigationUpgrade,
} from './lazy-replay';
