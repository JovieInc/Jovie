/**
 * Shared utilities for admin E2E tests
 *
 * Centralizes common patterns for admin-specific tests:
 * - Admin credential detection and retrieval
 * - Transient React 19 error handling
 * - Client-side error detection
 */

import type { Page } from '@playwright/test';

// ============================================================================
// Admin Credentials
// ============================================================================

interface AdminCredentials {
  username: string;
  password: string;
}

/**
 * Check if admin Clerk credentials are available.
 * Supports passwordless Clerk test emails (containing +clerk_test)
 */
export function hasAdminCredentials(): boolean {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = adminUsername.includes('+clerk_test');

  // Use admin-specific credentials if available
  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail)
  ) {
    return clerkSetupSuccess;
  }

  // Fall back to regular credentials
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const isRegularClerkTestEmail = username.includes('+clerk_test');

  return (
    username.length > 0 &&
    (password.length > 0 || isRegularClerkTestEmail) &&
    clerkSetupSuccess
  );
}

/**
 * Get admin credentials (admin-specific or fallback to regular)
 */
export function getAdminCredentials(): AdminCredentials {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
  const isClerkTestEmail = adminUsername.includes('+clerk_test');

  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail)
  ) {
    return { username: adminUsername, password: adminPassword };
  }

  return {
    username: process.env.E2E_CLERK_USER_USERNAME ?? '',
    password: process.env.E2E_CLERK_USER_PASSWORD ?? '',
  };
}

// ============================================================================
// Transient Error Handling
// ============================================================================

/**
 * Wait for the page to stabilize after transient React 19 hooks error.
 *
 * There's a known React 19 bug (facebook/react#33580) that causes a transient
 * "Rendered more hooks than during the previous render" error during hydration.
 * The error appears briefly then "magically disappears" as the page stabilizes.
 *
 * This function waits for the error to resolve itself.
 */
export async function waitForTransientErrorToResolve(
  page: Page,
  timeout = 15000
): Promise<void> {
  const startTime = Date.now();
  const intervals = [500, 1000, 2000, 3000, 5000];
  let intervalIndex = 0;

  while (Date.now() - startTime < timeout) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lowerText = bodyText.toLowerCase();

    const hasError =
      lowerText.includes('application error') ||
      lowerText.includes('client-side exception');

    if (!hasError) {
      return; // No error - page is stable
    }

    // Wait and retry
    const waitTime = intervals[Math.min(intervalIndex, intervals.length - 1)];
    await page.waitForTimeout(waitTime);
    intervalIndex++;
  }

  // If we get here, the error persisted beyond timeout
  throw new Error(
    'Client-side error did not resolve within timeout - page may have a persistent error'
  );
}

interface ClientErrorResult {
  hasError: boolean;
  errorText?: string;
}

/**
 * Check if the page has a client-side error (after waiting for transient errors to resolve)
 */
export async function checkForClientError(
  page: Page
): Promise<ClientErrorResult> {
  // First wait for any transient React 19 errors to resolve
  try {
    await waitForTransientErrorToResolve(page);
    return { hasError: false };
  } catch {
    // The error persisted - return it
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    return {
      hasError: true,
      errorText:
        'Client-side exception persisted - page crashed. Body: ' +
        bodyText.substring(0, 200),
    };
  }
}

// ============================================================================
// Admin Nav Helpers
// ============================================================================

interface WaitForAdminNavOptions {
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Wait for admin nav to become visible with retries.
 * Returns true if admin nav is visible, false if user doesn't have admin access.
 */
export async function waitForAdminNav(
  page: Page,
  options?: WaitForAdminNavOptions
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const delayMs = options?.delayMs ?? 1000;

  const adminNavSection = page.locator('[data-testid="admin-nav-section"]');

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  // Short hydration pause to let client-side JS settle
  await page.waitForTimeout(500);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await page.waitForTimeout(delayMs);
    const isVisible = await adminNavSection.isVisible().catch(() => false);
    if (isVisible) return true;
  }

  return false;
}
