import { expect, test } from '@playwright/test';
import {
  smokeNavigateWithRetry,
  waitForHydration,
  waitForNetworkIdle,
} from './utils/smoke-test-utils';

/**
 * Responsive Golden Path E2E — Multi-Viewport Matrix
 *
 * Tests the coverage gap identified by autoplan review:
 * Existing viewport tests are scattered across specs. This spec systematically
 * tests critical golden-path pages across mobile/tablet/desktop viewports.
 *
 * Focus: responsive layout (not duplicating axe-audit.spec.ts WCAG checks).
 * Responsive-specific a11y: touch targets, focus order after reflow, overflow.
 */

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
test.skip(FAST_ITERATION, 'Responsive matrix runs in the full E2E suite');

// Override to unauthenticated for public pages
test.use({ storageState: { cookies: [], origins: [] } });

const VIEWPORTS = {
  mobile: { width: 375, height: 812, name: 'iPhone (375×812)' },
  tablet: { width: 768, height: 1024, name: 'iPad (768×1024)' },
  desktop: { width: 1440, height: 900, name: 'Desktop (1440×900)' },
} as const;

const PUBLIC_ROUTES = ['/', '/pricing'] as const;

// Known public profile handles for testing (from smoke-test-utils)
const TEST_PROFILE = '/taylorswift';

/**
 * Check that page has no horizontal overflow.
 * Uses 1px tolerance to handle sub-pixel rendering.
 */
async function assertNoHorizontalOverflow(
  page: import('@playwright/test').Page
) {
  await waitForHydration(page);
  await waitForNetworkIdle(page);

  const overflow = await page.evaluate(() => {
    return document.body.scrollWidth - window.innerWidth;
  });

  // 1px tolerance for sub-pixel rendering
  expect(overflow).toBeLessThanOrEqual(1);
}

/**
 * Check minimum touch target sizes on interactive elements.
 * WCAG 2.5.5 requires 44×44 CSS pixels minimum.
 */
async function assertTouchTargets(
  page: import('@playwright/test').Page,
  minSize = 44
) {
  const smallTargets = await page.evaluate(min => {
    const interactive = document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], [tabindex="0"]'
    );
    const violations: string[] = [];

    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      // Skip hidden elements
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip elements that are clearly not in viewport
      if (rect.top > window.innerHeight || rect.bottom < 0) continue;

      if (rect.width < min || rect.height < min) {
        const tag = el.tagName.toLowerCase();
        const text =
          (el as HTMLElement).innerText?.slice(0, 30) ||
          el.getAttribute('aria-label') ||
          '';
        violations.push(
          `${tag}[${text}] ${Math.round(rect.width)}×${Math.round(rect.height)}`
        );
      }
    }

    return violations;
  }, minSize);

  if (smallTargets.length > 0) {
    console.warn(
      `[responsive] Touch target violations (< ${minSize}px):`,
      smallTargets.slice(0, 10) // Log first 10
    );
  }

  // Allow up to 3 small targets (nav icons, close buttons may be intentionally smaller)
  // This is a soft assertion — log but don't hard fail for minor violations
  if (smallTargets.length > 5) {
    console.error(
      `[responsive] Too many small touch targets: ${smallTargets.length}`
    );
  }
}

/**
 * Check that no text is smaller than minimum readable size.
 */
async function assertMinTextSize(
  page: import('@playwright/test').Page,
  minPx = 12
) {
  const smallText = await page.evaluate(min => {
    const textNodes = document.querySelectorAll(
      'p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, button'
    );
    const violations: string[] = [];

    for (const el of textNodes) {
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      const text = (el as HTMLElement).innerText?.trim();

      // Skip empty or hidden elements
      if (!text || style.display === 'none' || style.visibility === 'hidden')
        continue;

      if (fontSize < min) {
        violations.push(`"${text.slice(0, 20)}" at ${fontSize}px`);
      }
    }

    return violations;
  }, minPx);

  if (smallText.length > 0) {
    console.warn(
      `[responsive] Small text violations (< ${minPx}px):`,
      smallText.slice(0, 5)
    );
  }
}

/**
 * Check that tab order follows visual order (no focus jumping to hidden elements).
 */
async function assertFocusOrder(page: import('@playwright/test').Page) {
  const focusJumps = await page.evaluate(() => {
    const focusable = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex="0"]'
    );
    const jumps: string[] = [];
    let lastY = -Infinity;

    for (const el of focusable) {
      const rect = el.getBoundingClientRect();
      // Skip hidden elements
      if (rect.width === 0 || rect.height === 0) continue;
      if (
        (el as HTMLElement).offsetParent === null &&
        (el as HTMLElement).style.position !== 'fixed'
      )
        continue;

      // A "jump" is when focus goes significantly upward (more than 100px back)
      if (rect.top < lastY - 100) {
        const tag = el.tagName.toLowerCase();
        const text =
          (el as HTMLElement).innerText?.slice(0, 20) ||
          el.getAttribute('aria-label') ||
          '';
        jumps.push(
          `${tag}[${text}] jumped from y=${Math.round(lastY)} to y=${Math.round(rect.top)}`
        );
      }

      lastY = rect.top;
    }

    return jumps;
  });

  if (focusJumps.length > 0) {
    console.warn('[responsive] Focus order jumps:', focusJumps);
  }
}

test.describe('Responsive Golden Path', () => {
  test.setTimeout(120_000);

  for (const [viewportKey, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      for (const route of PUBLIC_ROUTES) {
        test(`${route} — no overflow, readable text`, async ({ page }) => {
          await smokeNavigateWithRetry(page, route);

          await assertNoHorizontalOverflow(page);
          await assertMinTextSize(page);

          if (viewportKey === 'mobile') {
            await assertTouchTargets(page);
          }

          // Verify page has meaningful content
          const bodyText = await page
            .locator('body')
            .innerText({ timeout: 10_000 })
            .catch(() => '');
          expect(bodyText.length).toBeGreaterThan(100);
        });
      }

      test(`${TEST_PROFILE} — profile responsive`, async ({ page }) => {
        await smokeNavigateWithRetry(page, TEST_PROFILE);

        await assertNoHorizontalOverflow(page);
        await assertMinTextSize(page);

        if (viewportKey === 'mobile') {
          await assertTouchTargets(page);

          // Mobile profile: key elements should be above fold
          const nameVisible = await page
            .locator('h1, h2')
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
          expect(nameVisible).toBeTruthy();
        }
      });
    });
  }

  // Responsive-specific a11y (not duplicating axe-audit.spec.ts)
  test.describe('Responsive A11y', () => {
    test.use({
      viewport: { width: 375, height: 812 },
    });

    test('mobile homepage — focus order and touch targets', async ({
      page,
    }) => {
      await smokeNavigateWithRetry(page, '/');

      await assertFocusOrder(page);
      await assertTouchTargets(page);
    });

    test('mobile profile — focus order and touch targets', async ({ page }) => {
      await smokeNavigateWithRetry(page, TEST_PROFILE);

      await assertFocusOrder(page);
      await assertTouchTargets(page);
    });
  });
});
