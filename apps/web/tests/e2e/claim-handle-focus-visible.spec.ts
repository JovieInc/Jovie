/**
 * E2E: claim-handle input focus-visible regression guard (JOV-INV-019)
 *
 * #47b1dd093ae4 ("restore claim input focus outlines") replaced a working
 * ring-based focus style with focus-visible:outline +
 * focus-visible:outline-2, which tailwind-merge collapses into a single
 * conflict group and keeps only the last one — outline-width without
 * outline-style paints nothing. A separate, unlayered global reset
 * (`:where(input, textarea, ...):focus { outline: none; }` in
 * design-system.css) also wins over any layered Tailwind outline utility
 * regardless of specificity, so an outline-based fix could not have worked
 * here at all. focus-visible:border-focus was equally inert visually (no
 * border-width on the bare input). Both claim-handle inputs
 * (ClaimHandleForm.tsx, ProductClaimHandleForm.tsx) silently had no
 * keyboard focus indicator for over a week before the "Capture exact
 * marketing routes" quality check happened to reach one via Tab order and
 * caught it.
 *
 * Uses real keyboard Tab navigation (not .focus()) and samples immediately
 * after, with no settle wait, to match the production
 * assertRegisteredQualityChecks() check exactly (tests/visual-qa/route-quality.ts)
 * — sampling immediately turned out to matter: focus-visible:border-focus's
 * color transitions in, so a version with a settle wait would pass on the
 * broken code too (the border eventually changes color) even though the
 * production check, which samples with no wait, still fails on it.
 * focus-ring-themed's box-shadow changes its string representation from
 * "none" to a real (if still visually transitioning) value on the very
 * first frame, so it satisfies the check at zero wait without relying on
 * timing. Targets the input by its accessible name rather than a fixed tab
 * index, so it isn't sensitive to what else is on the page. An
 * ElementHandle (not a `:focus-visible` Locator, which re-queries live and
 * stops matching the instant the element blurs) keeps a stable reference
 * to the same DOM node across the focus/blur sample.
 */

import type { ElementHandle, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { hasVisibleFocusStyleChange } from '../visual-qa/route-quality';

async function captureFocusStyle(handle: ElementHandle) {
  return handle.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

async function tabToHandleInput(
  page: Page
): Promise<ElementHandle<HTMLElement> | null> {
  for (let tabIndex = 0; tabIndex < 64; tabIndex += 1) {
    await page.keyboard.press('Tab');
    const handle = await page.evaluateHandle(
      () => document.activeElement as HTMLElement | null
    );
    const element = handle.asElement() as ElementHandle<HTMLElement> | null;
    if (!element) continue;
    const label = await element.evaluate(el => el.getAttribute('aria-label'));
    if (label === 'Choose Your Handle') return element;
  }
  return null;
}

const ROUTES = ['/pay', '/product'] as const;

for (const route of ROUTES) {
  test(`claim-handle input on ${route} shows a real focus-visible style`, async ({
    page,
  }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const input = await tabToHandleInput(page);
    expect(
      input,
      `${route}: never tabbed to the claim-handle input`
    ).not.toBeNull();
    if (!input) return;

    const focused = await captureFocusStyle(input);
    await input.evaluate(element => element.blur());
    const blurred = await captureFocusStyle(input);

    expect(
      hasVisibleFocusStyleChange(focused, blurred),
      `${route} claim-handle input focus indicator ${JSON.stringify({ focused, blurred })}`
    ).toBe(true);
  });
}
