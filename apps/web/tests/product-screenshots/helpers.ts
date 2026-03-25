/**
 * Shared helpers for product screenshot specs.
 */

import { Page } from '@playwright/test';

export const TIMEOUTS = {
  NAVIGATION: 90_000,
  CONTENT_VISIBLE: 20_000,
  SIDEBAR_VISIBLE: 10_000,
  SETTLE: 3_000,
} as const;

export const OUTPUT_DIR = 'public/product-screenshots';

/**
 * Selectors for dev overlays that must be hidden before capturing screenshots.
 * Exported so tests can verify this list stays comprehensive.
 */
export const DEV_OVERLAY_SELECTORS = [
  // Toasts & notifications
  '[data-sonner-toaster]',
  // Cookie consent
  '[data-testid="cookie-banner"], [data-cookie-banner]',
  // Tooltips
  '[role="tooltip"]',
  // Intercom chat widget
  '#intercom-container, .intercom-lightweight-app',
  // Custom DevToolbar (collapsed button + expanded panel)
  '[data-testid="dev-toolbar"]',
  // TanStack Query DevTools (toggle button + panel)
  '.tsqd-parent-container',
  'button[aria-label*="query devtools" i]',
  // Vercel toolbar (preview deploys)
  '#vercel-toolbar',
  // Next.js dev overlays
  '[data-nextjs-dialog-overlay]',
  '[data-nextjs-toast]',
  'nextjs-portal',
] as const;

/** Wait for network to settle and animations to finish */
export async function waitForSettle(page: Page, ms: number = TIMEOUTS.SETTLE) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Hide transient UI that shouldn't appear in marketing screenshots */
export async function hideTransientUI(page: Page) {
  await page.evaluate((selectors: readonly string[]) => {
    const hide = (selector: string) =>
      document
        .querySelectorAll(selector)
        .forEach(el => ((el as HTMLElement).style.display = 'none'));

    for (const selector of selectors) {
      hide(selector);
    }
  }, DEV_OVERLAY_SELECTORS);
}

/**
 * Assert that no dev overlays are visible on the page.
 * Call after hideTransientUI() and before page.screenshot() to catch regressions.
 */
export async function assertNoDevOverlays(page: Page) {
  const results = await page.evaluate((selectors: readonly string[]) => {
    const visible: string[] = [];
    for (const selector of selectors) {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.offsetParent !== null || htmlEl.style.display !== 'none') {
          visible.push(selector);
          break;
        }
      }
    }
    return visible;
  }, DEV_OVERLAY_SELECTORS);

  if (results.length > 0) {
    throw new Error(
      `Dev overlay(s) still visible before screenshot: ${results.join(', ')}`
    );
  }
}

/** Wait for all images within a container to finish loading */
export async function waitForImages(
  page: Page,
  containerSelector: string = 'body',
  timeout: number = TIMEOUTS.CONTENT_VISIBLE
) {
  await page.waitForFunction(
    (selector: string) => {
      const container =
        selector === 'body' ? document.body : document.querySelector(selector);
      if (!container) return false;
      const images = container.querySelectorAll('img');
      return (
        images.length > 0 &&
        Array.from(images).every(
          img =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0
        )
      );
    },
    containerSelector,
    { timeout }
  );
}

/** Standard auth guard — skips the test if credentials aren't available */
export function shouldSkipAuth(testInfo: { skip: () => void }): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME;
  if (!username) {
    console.warn('⚠ Skipping: E2E_CLERK_USER_USERNAME not configured');
    testInfo.skip();
    return true;
  }
  // +clerk_test emails use Clerk's testing library (magic OTP 424242) — no password needed
  if (
    !username.includes('+clerk_test') &&
    !process.env.E2E_CLERK_USER_PASSWORD
  ) {
    console.warn(
      '⚠ Skipping: E2E_CLERK_USER_PASSWORD not configured (required for non-test emails)'
    );
    testInfo.skip();
    return true;
  }
  if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    console.warn('⚠ Skipping: Clerk testing setup was not successful');
    testInfo.skip();
    return true;
  }
  return false;
}
