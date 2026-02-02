/**
 * Shared utilities for E2E smoke tests
 *
 * Centralizes common patterns for:
 * - Console error filtering
 * - Network monitoring
 * - Test timeouts
 * - Page state assertions
 * - Retry logic for flaky operations
 */

import { expect, Page } from '@playwright/test';

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard timeouts for smoke tests (tuned for CI performance)
 * Increased to handle Turbopack compilation and React hydration
 */
export const SMOKE_TIMEOUTS = {
  /** Default page navigation timeout */
  NAVIGATION: 60_000, // Increased from 30s to 60s for Turbopack
  /** Element visibility timeout */
  VISIBILITY: 20_000, // Increased from 10s to 20s for hydration
  /** Quick element check */
  QUICK: 10_000, // Increased from 5s to 10s
  /** URL stabilization after redirect */
  URL_STABLE: 10_000, // Increased from 5s to 10s
  /** Network buffer after navigation */
  NETWORK_BUFFER: 1000, // Increased from 500ms to 1s
  /** Default retry delay between attempts */
  RETRY_DELAY: 1000, // Increased from 500ms to 1s
  /** Hydration settling time (replaces waitForTimeout anti-pattern) */
  HYDRATION_SETTLE: 200, // Increased from 100ms to 200ms
} as const;

/**
 * Retry configuration for flaky operations
 */
export const RETRY_CONFIG = {
  /** Default number of retries */
  DEFAULT_RETRIES: 3,
  /** Intervals for exponential backoff (ms) */
  BACKOFF_INTERVALS: [500, 1000, 2000] as const,
} as const;

/**
 * Patterns for console errors that are expected in test environments
 * and should not fail tests
 *
 * These patterns cover:
 * - Authentication/auth provider issues (expected without real config)
 * - Network/resource loading (non-critical)
 * - Security headers (normal in test)
 * - Framework development warnings
 * - Third-party service errors (analytics, etc.)
 */
export const EXPECTED_ERROR_PATTERNS = [
  // Auth/Clerk related
  'clerk',
  'handshake',
  'authentication',
  'test-pass-',
  'publishable key',
  'unauthorized',
  // Network/resource loading (non-critical)
  'failed to load resource',
  'net::err_',
  'net::err_failed',
  'net::err_connection_refused',
  'net::err_name_not_resolved',
  'fetch failed',
  '404',
  // CSP and security headers (expected in test)
  'content security policy',
  'csp',
  'blocked by cors',
  'cross-origin',
  // React/Next.js development warnings
  'warning:',
  'hydration',
  'text content does not match',
  'server rendered html',
  'did not match',
  'extra attributes from the server',
  // Nonce mismatches in test environment
  'nonce',
  // Test environment indicators
  'test environment',
  'mock data',
  'dummy',
  'placeholder',
  // Analytics (not critical for smoke)
  'analytics',
  'tracking',
  'posthog',
  'mixpanel',
  'segment',
  // Vercel-specific
  'vercel',
  '__vercel',
  // Image/media loading errors
  'i.scdn.co', // Spotify CDN
  'image',
  'loading image',
  // Sentry/monitoring
  'sentry',
  'dsn',
  // Database/API errors in CI (expected without DB)
  'database',
  'connection',
  'prisma',
  'drizzle',
  // WebSocket/realtime
  'websocket',
  'socket',
  // Third-party scripts
  'google',
  'facebook',
  'twitter',
  'stripe',
  // Browser-specific
  'deprecated',
  'passive event listener',
] as const;

// ============================================================================
// Types
// ============================================================================

export interface NetworkDiagnostics {
  pageUrl: string;
  failedResponses: Array<{
    url: string;
    status: number;
    statusText: string;
  }>;
  failedRequests: Array<{
    url: string;
    failureText: string;
  }>;
  consoleErrors: string[];
  consoleNetworkErrors: string[];
}

export interface SmokeTestContext {
  consoleErrors: string[];
  criticalErrors: string[];
  networkDiagnostics: NetworkDiagnostics;
}

// ============================================================================
// Error Filtering
// ============================================================================

/**
 * Check if a console error message should be ignored in smoke tests
 */
export function isExpectedError(errorText: string): boolean {
  const lowerText = errorText.toLowerCase();
  return EXPECTED_ERROR_PATTERNS.some(pattern => lowerText.includes(pattern));
}

/**
 * Filter console errors to only critical ones
 */
export function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(error => !isExpectedError(error));
}

/**
 * Check if a failed network response is critical
 * Returns true only for same-origin API failures
 */
export function isCriticalNetworkFailure(res: {
  url: string;
  status: number;
}): boolean {
  const { url, status } = res;

  // 5xx is always critical
  if (status >= 500) return true;

  // Ignore expected auth failures
  if (status === 401 || status === 403) return false;

  // Only treat same-origin API failures as critical
  try {
    const parsed = new URL(url);
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocalhost) return false;

    const path = parsed.pathname;
    const isApiRoute = path.startsWith('/api/') || path.startsWith('/trpc/');
    return isApiRoute && status >= 400;
  } catch {
    return false;
  }
}

// ============================================================================
// Page Monitoring
// ============================================================================

/**
 * Set up console and network monitoring for a page
 * Returns cleanup function and access to collected diagnostics
 */
export function setupPageMonitoring(page: Page): {
  getContext: () => SmokeTestContext;
  cleanup: () => void;
} {
  const consoleErrors: string[] = [];
  const consoleNetworkErrors: string[] = [];
  const failedResponses: NetworkDiagnostics['failedResponses'] = [];
  const failedRequests: NetworkDiagnostics['failedRequests'] = [];

  const handleConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
      if (text.includes('Failed to load resource')) {
        consoleNetworkErrors.push(text);
      }
    }
  };

  const handleResponse = (res: {
    status: () => number;
    url: () => string;
    statusText: () => string;
  }) => {
    const status = res.status();
    if (status >= 400) {
      failedResponses.push({
        url: res.url(),
        status,
        statusText: res.statusText(),
      });
    }
  };

  const handleRequestFailed = (req: {
    url: () => string;
    failure: () => { errorText: string } | null;
  }) => {
    failedRequests.push({
      url: req.url(),
      failureText: req.failure()?.errorText || 'unknown',
    });
  };

  page.on('console', handleConsole);
  page.on('response', handleResponse);
  page.on('requestfailed', handleRequestFailed);

  return {
    getContext: (): SmokeTestContext => ({
      consoleErrors,
      criticalErrors: filterCriticalErrors(consoleErrors),
      networkDiagnostics: {
        pageUrl: page.url(),
        failedResponses,
        failedRequests,
        consoleErrors,
        consoleNetworkErrors,
      },
    }),
    cleanup: () => {
      page.off('console', handleConsole);
      page.off('response', handleResponse);
      page.off('requestfailed', handleRequestFailed);
    },
  };
}

// ============================================================================
// Assertions
// ============================================================================

/**
 * Assert no critical console errors occurred
 */
export async function assertNoCriticalErrors(
  context: SmokeTestContext,
  testInfo?: { attach: (name: string, options: object) => Promise<void> }
): Promise<void> {
  // Attach network diagnostics for debugging
  if (testInfo) {
    await testInfo.attach('network-diagnostics', {
      body: JSON.stringify(context.networkDiagnostics, null, 2),
      contentType: 'application/json',
    });
  }

  // Log warnings for non-critical issues
  if (
    context.networkDiagnostics.failedResponses.length > 0 ||
    context.networkDiagnostics.failedRequests.length > 0
  ) {
    console.warn('Network issues detected:', {
      failedResponses: context.networkDiagnostics.failedResponses,
      failedRequests: context.networkDiagnostics.failedRequests,
    });
  }

  // Assert no critical errors
  expect(
    context.criticalErrors,
    `Critical console errors found:\n${context.criticalErrors.join('\n')}`
  ).toHaveLength(0);
}

/**
 * Assert page has rendered meaningful content
 */
export async function assertPageRendered(page: Page): Promise<void> {
  const mainContent = await page.locator('main, [role="main"], body').first();
  await expect(mainContent).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

/**
 * Assert page is on one of the expected URLs (handles auth redirects)
 */
export async function assertValidPageState(
  page: Page,
  options: {
    expectedPaths: string[];
    allowAuthRedirect?: boolean;
  }
): Promise<{ isOnExpectedPath: boolean; isOnAuthPage: boolean }> {
  const currentUrl = page.url();

  const isOnAuthPage =
    currentUrl.includes('/signin') ||
    currentUrl.includes('/signup') ||
    currentUrl.includes('/sign-in') ||
    currentUrl.includes('/sign-up') ||
    (currentUrl.includes('clerk') && currentUrl.includes('handshake'));

  const isOnExpectedPath = options.expectedPaths.some(path =>
    currentUrl.includes(path)
  );

  const isValid =
    isOnExpectedPath || (options.allowAuthRedirect && isOnAuthPage);

  if (!isValid) {
    console.log(`Unexpected URL: ${currentUrl}`);
    console.log(`Expected one of: ${options.expectedPaths.join(', ')}`);
  }

  expect(isValid).toBe(true);

  return { isOnExpectedPath, isOnAuthPage };
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to a page with standard smoke test settings
 */
export async function smokeNavigate(
  page: Page,
  url: string,
  options?: { timeout?: number }
): Promise<ReturnType<Page['goto']>> {
  return page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: options?.timeout ?? SMOKE_TIMEOUTS.NAVIGATION,
  });
}

/**
 * Wait for URL to stabilize after potential redirects
 */
export async function waitForUrlStable(
  page: Page,
  urlMatcher: (url: URL) => boolean,
  options?: { timeout?: number }
): Promise<void> {
  try {
    await page.waitForURL(urlMatcher, {
      timeout: options?.timeout ?? SMOKE_TIMEOUTS.URL_STABLE,
    });
  } catch {
    // URL didn't change within timeout, continue with current URL
  }
}

// ============================================================================
// Test Data
// ============================================================================

/**
 * Public test profile handles (seeded by global-setup.ts)
 */
export const TEST_PROFILES = {
  DUALIPA: 'dualipa',
  TAYLORSWIFT: 'taylorswift',
} as const;

export const PUBLIC_HANDLES = Object.values(TEST_PROFILES);

// ============================================================================
// Retry Utilities
// ============================================================================

/**
 * Retry an async operation with exponential backoff
 * Use this for operations that may fail due to timing/network issues
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    intervals?: readonly number[];
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const retries = options?.retries ?? RETRY_CONFIG.DEFAULT_RETRIES;
  const intervals = options?.intervals ?? RETRY_CONFIG.BACKOFF_INTERVALS;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delay = intervals[Math.min(attempt, intervals.length - 1)];
        options?.onRetry?.(attempt + 1, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Wait for network to be idle (no pending requests)
 * More reliable than fixed timeouts for dynamic content
 */
export async function waitForNetworkIdle(
  page: Page,
  options?: { timeout?: number; idleTime?: number }
): Promise<void> {
  const timeout = options?.timeout ?? SMOKE_TIMEOUTS.VISIBILITY;
  const idleTime = options?.idleTime ?? 500;

  await page.waitForLoadState('networkidle', { timeout }).catch(() => {
    // If network idle doesn't occur, wait for DOM to be ready
    return page.waitForLoadState('domcontentloaded', { timeout });
  });

  // Small buffer for late responses
  await page.waitForTimeout(
    Math.min(idleTime, SMOKE_TIMEOUTS.HYDRATION_SETTLE)
  );
}

/**
 * Wait for page to be fully interactive (hydration complete)
 * Replaces arbitrary waitForTimeout calls
 */
export async function waitForHydration(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? SMOKE_TIMEOUTS.VISIBILITY;

  // Wait for load state
  await page.waitForLoadState('load', { timeout });

  // Check for React hydration completion by waiting for __NEXT_DATA__ to be processed
  await page
    .waitForFunction(
      () => {
        // Check if React has hydrated (no hydration markers remaining)
        const hasHydrationError =
          document.body.innerHTML.includes('Hydration failed');
        // Check if document is interactive
        const isReady =
          document.readyState === 'complete' ||
          document.readyState === 'interactive';
        return isReady && !hasHydrationError;
      },
      { timeout }
    )
    .catch(() => {
      // Fallback: just ensure DOM is ready
    });
}

// ============================================================================
// Enhanced Assertions
// ============================================================================

/**
 * Assert an element is visible with retry logic for flaky visibility
 */
export async function assertElementVisible(
  page: Page,
  selector: string,
  options?: { timeout?: number; description?: string }
): Promise<void> {
  const timeout = options?.timeout ?? SMOKE_TIMEOUTS.VISIBILITY;
  const description = options?.description ?? selector;

  await expect(page.locator(selector).first(), description).toBeVisible({
    timeout,
  });
}

/**
 * Assert page has no critical errors with enhanced diagnostics
 */
export async function assertPageHealthy(
  page: Page,
  context: SmokeTestContext,
  testInfo?: { attach: (name: string, options: object) => Promise<void> }
): Promise<void> {
  // Check for error page indicators
  const bodyText = await page
    .locator('body')
    .textContent()
    .catch(() => '');
  const errorIndicators = [
    'application error',
    'internal server error',
    'something went wrong',
    'unhandled runtime error',
  ];

  const hasErrorPage = errorIndicators.some(indicator =>
    bodyText?.toLowerCase().includes(indicator)
  );

  if (hasErrorPage) {
    // Attach diagnostic info before failing
    if (testInfo) {
      await testInfo.attach('error-page-content', {
        body: bodyText ?? 'No content',
        contentType: 'text/plain',
      });
    }
  }

  expect(hasErrorPage, 'Page should not show error indicators').toBe(false);

  // Run standard error check
  await assertNoCriticalErrors(context, testInfo);
}

/**
 * Safely check if an element exists without throwing
 */
export async function elementExists(
  page: Page,
  selector: string,
  options?: { timeout?: number }
): Promise<boolean> {
  const timeout = options?.timeout ?? SMOKE_TIMEOUTS.QUICK;

  try {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: 'attached', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely check if an element is visible without throwing
 */
export async function elementVisible(
  page: Page,
  selector: string,
  options?: { timeout?: number }
): Promise<boolean> {
  const timeout = options?.timeout ?? SMOKE_TIMEOUTS.QUICK;

  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Navigation Helpers (Enhanced)
// ============================================================================

/**
 * Navigate with retry logic for flaky network conditions
 */
export async function smokeNavigateWithRetry(
  page: Page,
  url: string,
  options?: { timeout?: number; retries?: number }
): Promise<ReturnType<Page['goto']>> {
  const retries = options?.retries ?? 2;

  return withRetry(
    () => smokeNavigate(page, url, { timeout: options?.timeout }),
    {
      retries,
      onRetry: attempt => {
        console.warn(`Navigation retry ${attempt} for ${url}`);
      },
    }
  );
}

/**
 * Navigate and wait for the page to be fully interactive
 */
export async function navigateAndWaitForHydration(
  page: Page,
  url: string,
  options?: { timeout?: number }
): Promise<ReturnType<Page['goto']>> {
  const response = await smokeNavigate(page, url, options);
  await waitForHydration(page, options);
  return response;
}

// ============================================================================
// Data-testid Selectors (Preferred for Smoke Tests)
// ============================================================================

/**
 * Standard data-testid selectors for smoke tests
 * Using data-testid is more stable than text/CSS selectors
 */
export const SMOKE_SELECTORS = {
  // Primary UI elements
  PRIMARY_CTA: '[data-testid="primary-cta"]',
  PROFILE_AVATAR: '[data-testid="profile-avatar"]',
  LISTEN_BUTTON: '[data-testid="listen-button"]',
  TIP_BUTTON: '[data-testid="tip-button"]',
  BACK_BUTTON:
    '[data-testid="back-button"], button[aria-label="Back to profile"], button:has-text("Back")',
  // Page structure
  MAIN_CONTENT: 'main, [role="main"], body',
  PAGE_HEADING: 'h1',
  // Error indicators
  ERROR_PAGE: '[data-testid="error-page"]',
  NOT_FOUND: '[data-testid="not-found"]',
} as const;

/**
 * Build a flexible selector that falls back gracefully
 * Priority: data-testid > aria-label > text content > CSS
 */
export function buildRobustSelector(options: {
  testId?: string;
  ariaLabel?: string;
  text?: string | RegExp;
  css?: string;
}): string {
  if (options.testId) {
    return `[data-testid="${options.testId}"]`;
  }
  if (options.ariaLabel) {
    return `[aria-label="${options.ariaLabel}"]`;
  }
  if (options.text !== undefined) {
    // Use Playwright's text selector syntax
    if (typeof options.text === 'string') {
      // Escape quotes in the text string
      const escapedText = options.text.replace(/"/g, '\\"');
      return `text="${escapedText}"`;
    } else {
      // RegExp: convert to Playwright regex text selector
      return `text=/${options.text.source}/${options.text.flags}`;
    }
  }
  if (options.css) {
    return options.css;
  }
  // Fallback to match any element (should rarely be reached)
  return '*';
}
