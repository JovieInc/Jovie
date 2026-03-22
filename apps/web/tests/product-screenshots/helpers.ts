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

/** Wait for network to settle and animations to finish */
export async function waitForSettle(page: Page, ms: number = TIMEOUTS.SETTLE) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Hide transient UI that shouldn't appear in marketing screenshots */
export async function hideTransientUI(page: Page) {
  await page.evaluate(() => {
    const hide = (selector: string) =>
      document
        .querySelectorAll(selector)
        .forEach(el => ((el as HTMLElement).style.display = 'none'));

    hide('[data-sonner-toaster]');
    hide('[data-cookie-banner]');
    hide('[role="tooltip"]');
    hide('#intercom-container, .intercom-lightweight-app');
  });
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
  if (
    !process.env.E2E_CLERK_USER_USERNAME ||
    !process.env.E2E_CLERK_USER_PASSWORD
  ) {
    console.warn('⚠ Skipping: E2E credentials not configured');
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
