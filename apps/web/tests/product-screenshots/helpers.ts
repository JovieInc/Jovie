/**
 * Shared helpers for product screenshot specs.
 */

import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';

export const TIMEOUTS = {
  NAVIGATION: 90_000,
  CONTENT_VISIBLE: 20_000,
  SIDEBAR_VISIBLE: 10_000,
  SETTLE: 3_000,
} as const;

const WEB_ROOT = resolve(__dirname, '../..');

export const CATALOG_OUTPUT_DIR = join(
  WEB_ROOT,
  'screenshot-catalog',
  'current'
);
export const PUBLIC_EXPORT_DIR = join(
  WEB_ROOT,
  'public',
  'product-screenshots'
);
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
  '[data-nextjs-dev-tools-button]',
  'nextjs-portal',
  '#nextjs-dev-tools-menu',
  '#nextjs__container_errors_label',
  // Next.js dev build indicator — explicit selector in case nextjs-portal doesn't catch it
  '[data-nextjs-build-indicator]',
] as const;

const DEV_OVERLAY_TEXT_PATTERNS = [
  '\\b\\d+\\s+Issue(s)?\\b',
  'Unhandled Runtime Error',
  'Build Error',
  'Hydration failed',
  'In HTML,\\s*<button>\\s*cannot be a descendant',
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
  const results = await page.evaluate(
    ({
      selectors,
      textPatterns,
    }: {
      readonly selectors: readonly string[];
      readonly textPatterns: readonly string[];
    }) => {
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
      const visibleText = document.body.innerText;
      for (const pattern of textPatterns) {
        if (new RegExp(pattern, 'i').test(visibleText)) {
          visible.push(pattern);
        }
      }
      return visible;
    },
    {
      selectors: DEV_OVERLAY_SELECTORS,
      textPatterns: DEV_OVERLAY_TEXT_PATTERNS,
    }
  );

  if (results.length > 0) {
    throw new Error(
      `Dev overlay(s) still visible before screenshot: ${results.join(', ')}`
    );
  }
}

/**
 * Fail a screenshot before export when an annotated text/surface pair is
 * unreadable. The annotations live on the production components so the audit
 * follows the rendered semantic tokens instead of sampling a stale PNG.
 */
export async function assertScreenshotTextContrast(
  page: Page,
  minimumChecks = 0
) {
  const results = await page.evaluate(() => {
    const parseRgb = (value: string) => {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      return channels?.length === 3 ? channels : null;
    };
    const luminance = (channels: number[]) => {
      const [r = 0, g = 0, b = 0] = channels.map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-screenshot-contrast-text]')
    ).map((textElement, index) => {
      const surface = textElement.closest<HTMLElement>(
        '[data-screenshot-contrast-surface]'
      );
      if (!surface) {
        return {
          index,
          ratio: 0,
          error: 'missing annotated contrast surface',
        };
      }

      const foreground = parseRgb(getComputedStyle(textElement).color);
      const background = parseRgb(getComputedStyle(surface).backgroundColor);
      if (!foreground || !background) {
        return {
          index,
          ratio: 0,
          error: 'could not resolve computed RGB colors',
        };
      }

      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      const ratio =
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

      return {
        index,
        ratio,
        foreground: getComputedStyle(textElement).color,
        background: getComputedStyle(surface).backgroundColor,
      };
    });
  });

  if (results.length < minimumChecks) {
    throw new Error(
      `Screenshot contrast audit expected at least ${minimumChecks} annotated pair(s), found ${results.length}`
    );
  }

  const failures = results.filter(result => result.ratio < 4.5);
  if (failures.length > 0) {
    throw new Error(
      `Screenshot contrast audit failed: ${JSON.stringify(failures)}`
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
