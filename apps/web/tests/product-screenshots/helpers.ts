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

export const CATALOG_OUTPUT_DIR = 'screenshot-catalog/current';
export const PUBLIC_EXPORT_DIR = 'public/product-screenshots';
export const OUTPUT_DIR = PUBLIC_EXPORT_DIR;
export const SCREENSHOT_CLOCK_ISO = '2026-04-15T16:00:00.000Z';

/**
 * Selectors for dev overlays that must be hidden before capturing screenshots.
 * Exported so tests can verify this list stays comprehensive.
 *
 * Some selectors target library internals (.tsqd-parent-container, #vercel-toolbar)
 * and may need updating when upgrading TanStack Query DevTools or @vercel/toolbar.
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
  // TanStack Query DevTools — internal class, check on @tanstack/react-query-devtools upgrade
  '.tsqd-parent-container',
  // TanStack DevTools toggle — aria-label text, check on upgrade
  'button[aria-label*="query devtools" i]',
  // Vercel toolbar — internal ID, check on @vercel/toolbar upgrade
  '#vercel-toolbar',
  // Next.js dev overlays
  '[data-nextjs-dialog-overlay]',
  '[data-nextjs-toast]',
  'nextjs-portal',
  // Next.js dev build indicator — explicit selector in case nextjs-portal doesn't catch it
  '[data-nextjs-build-indicator]',
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
        const style = window.getComputedStyle(htmlEl);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
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
