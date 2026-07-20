/**
 * Shared utilities for admin E2E tests
 *
 * Centralizes common patterns for admin-specific tests:
 * - Admin credential detection and retrieval
 * - Transient React 19 error handling
 * - Client-side error detection
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ensureSignedInUser,
  getAdminCredentials as getSharedAdminCredentials,
  hasAdminCredentials as hasSharedAdminCredentials,
  setTestAuthBypassSession,
} from '../../helpers/clerk-auth';

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
  return hasSharedAdminCredentials();
}

/**
 * Get admin credentials (admin-specific or fallback to regular)
 */
export function getAdminCredentials(): AdminCredentials {
  return getSharedAdminCredentials();
}

/**
 * Sign the page in as an ADMIN identity.
 *
 * Under Better Auth the dev bypass is the only auth path and
 * `ensureSignedInUser` resolves the persona from `E2E_TEST_AUTH_PERSONA`
 * (creator/creator-ready in the heavy lanes), so admin specs that rely on it
 * land on the dashboard redirect instead of the admin workspace (JOV-4326).
 * The bypass has a dedicated `admin` persona (`users.isAdmin = true`); the
 * session route mints its cookie into the browser context. This mirrors the
 * pattern already used by admin-visual-regression.spec.ts and
 * nightly/full-surface-chaos.spec.ts.
 *
 * Like the legacy bypass sign-in, this lands on the app shell (`/app`) so
 * specs can assume an authenticated dashboard is already loaded.
 */
export async function signInAsAdmin(page: Page): Promise<Page> {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    await setTestAuthBypassSession(page, 'admin');
    await page.goto(APP_ROUTES.DASHBOARD, { waitUntil: 'domcontentloaded' });
    // Mirror waitForShellReadyAfterAuth: the shell (or chat composer) must be
    // visible before specs interact with the dashboard.
    const main = page.locator('main').first();
    const chatComposer = page
      .locator('textarea, [contenteditable="true"], a[href="/app/chat"]')
      .first();
    await expect
      .poll(
        async () =>
          (await main.isVisible().catch(() => false)) ||
          (await chatComposer.isVisible().catch(() => false)),
        { timeout: 30_000, intervals: [2_000, 5_000, 10_000] }
      )
      .toBe(true);
    return page;
  }

  return ensureSignedInUser(page, getAdminCredentials());
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
  // Use expect.poll() to repeatedly check for error resolution without fixed sleeps
  await expect
    .poll(
      async () => {
        const bodyText = await page
          .locator('body')
          .innerText()
          .catch(() => '');
        const lowerText = bodyText.toLowerCase();
        return (
          !lowerText.includes('application error') &&
          !lowerText.includes('client-side exception')
        );
      },
      {
        message:
          'Client-side error did not resolve within timeout - page may have a persistent error',
        timeout,
        intervals: [500, 1000, 2000, 3000, 5000],
      }
    )
    .toBe(true);
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
  // Wait for client-side JS to settle by checking document readiness
  await page
    .waitForFunction(
      () =>
        document.readyState === 'complete' ||
        document.readyState === 'interactive',
      { timeout: 5000 }
    )
    .catch(() => {});

  // Use expect.poll() to check for admin nav visibility without fixed delays
  try {
    await expect
      .poll(async () => adminNavSection.isVisible().catch(() => false), {
        timeout: maxAttempts * delayMs,
        intervals: Array(maxAttempts).fill(delayMs),
      })
      .toBe(true);
    return true;
  } catch {
    return false;
  }
}
