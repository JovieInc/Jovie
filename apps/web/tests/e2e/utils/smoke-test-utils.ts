/**
 * Shared utilities for E2E smoke tests
 *
 * Centralizes common patterns for:
 * - Console error filtering
 * - Network monitoring
 * - Test timeouts
 * - Page state assertions
 */

import { expect, Page } from '@playwright/test';

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard timeouts for smoke tests (tuned for CI performance)
 */
export const SMOKE_TIMEOUTS = {
  /** Default page navigation timeout */
  NAVIGATION: 15_000,
  /** Element visibility timeout */
  VISIBILITY: 10_000,
  /** Quick element check */
  QUICK: 5_000,
  /** URL stabilization after redirect */
  URL_STABLE: 5_000,
  /** Network buffer after navigation */
  NETWORK_BUFFER: 500,
} as const;

/**
 * Patterns for console errors that are expected in test environments
 * and should not fail tests
 */
export const EXPECTED_ERROR_PATTERNS = [
  // Auth/Clerk related
  'clerk',
  'handshake',
  'authentication',
  'test-pass-',
  // Network/resource loading (non-critical)
  'failed to load resource',
  'net::err_',
  // CSP and security headers (expected in test)
  'content security policy',
  'csp',
  // React/Next.js development warnings
  'warning:',
  'hydration',
  // Nonce mismatches in test environment
  'nonce',
  'did not match',
  // Test environment indicators
  'test environment',
  'mock data',
  // Analytics (not critical for smoke)
  'analytics',
  'tracking',
  // Vercel-specific
  'vercel',
  '__vercel',
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
    // eslint-disable-next-line no-console
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
    currentUrl.includes('/sign-in') ||
    currentUrl.includes('/sign-up') ||
    currentUrl.includes('/signin') ||
    currentUrl.includes('/signup') ||
    (currentUrl.includes('clerk') && currentUrl.includes('handshake'));

  const isOnExpectedPath = options.expectedPaths.some(path =>
    currentUrl.includes(path)
  );

  const isValid =
    isOnExpectedPath || (options.allowAuthRedirect && isOnAuthPage);

  if (!isValid) {
    // eslint-disable-next-line no-console
    console.log(`Unexpected URL: ${currentUrl}`);
    // eslint-disable-next-line no-console
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
