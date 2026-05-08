import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface ScrollAssertionOptions {
  /**
   * CSS selector for the element that owns the scroll. Defaults to the
   * document scrolling element. For app-shell routes, scroll lives on the
   * inner AppShellFrame content pane — pass `[data-testid="app-shell-scroll"]`.
   */
  readonly containerSelector?: string;
  /** Viewport height to test at. Defaults to 720px. */
  readonly viewportHeight?: number;
  /** Viewport width to test at. Defaults to 1280px. */
  readonly viewportWidth?: number;
  /** Wheel-scroll delta in pixels. Defaults to 800. */
  readonly wheelDelta?: number;
}

interface AssertBottomReachableOptions extends ScrollAssertionOptions {}

async function readScrollMetrics(
  page: Page,
  containerSelector: string | null
): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number }> {
  return page.evaluate(sel => {
    const el = sel
      ? (document.querySelector(sel) as HTMLElement | null)
      : (document.scrollingElement as HTMLElement | null);
    if (!el) {
      throw new Error(
        sel
          ? `Scroll container not found for selector: ${sel}`
          : 'Document scrollingElement is null — cannot measure scroll metrics'
      );
    }
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  }, containerSelector);
}

/**
 * Asserts that the page actually scrolls at the given viewport: the container
 * overflows, AND a real wheel scroll moves `scrollTop`.
 *
 * Catches the bug class where a parent's `overflow: hidden` traps content
 * past the viewport — `scrollIntoView` would mask this defect, but the user
 * cannot wheel-scroll to reach the content.
 *
 * Use this on routes where placing a stable bottom-marker testid is
 * impractical (e.g. Suspense boundaries with data-dependent tail content).
 * For routes with a stable bottom element, prefer `assertBottomReachable`.
 */
export async function assertScrollable(
  page: Page,
  opts: ScrollAssertionOptions = {}
): Promise<void> {
  const viewportWidth = opts.viewportWidth ?? 1280;
  const viewportHeight = opts.viewportHeight ?? 720;
  const wheelDelta = opts.wheelDelta ?? 800;
  const containerSelector = opts.containerSelector ?? null;

  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });

  const before = await readScrollMetrics(page, containerSelector);
  expect(
    before.scrollHeight,
    `scroll container ${containerSelector ?? 'document'} must exist`
  ).toBeGreaterThan(0);
  expect(
    before.scrollHeight,
    `page must overflow its scroll container at ${viewportWidth}x${viewportHeight} for this assertion to be meaningful`
  ).toBeGreaterThan(before.clientHeight + 4);

  // Move the cursor over the container before wheeling so the event lands on
  // the right element when the scroll is on a non-document container.
  if (containerSelector) {
    const target = page.locator(containerSelector);
    await target.hover();
  }
  await page.mouse.wheel(0, wheelDelta);
  await page.waitForTimeout(80);

  const after = await readScrollMetrics(page, containerSelector);
  expect(
    after.scrollTop,
    'real wheel scroll must change scrollTop (overflow:hidden traps the user even though scrollIntoView appears to work)'
  ).toBeGreaterThan(before.scrollTop);
}

/**
 * Asserts that the bottom-most content on a page is reachable via real scroll.
 *
 * Place a stable `data-testid` on the last meaningful element of the route
 * and call this in the route's E2E spec. Verifies:
 *   1. A real scroll container exists at this viewport size.
 *   2. A real wheel scroll moves `scrollTop` (catches `overflow: hidden`).
 *   3. The bottom marker ends up in the viewport after the scroll.
 *
 * For routes where a stable bottom marker is impractical (Suspense boundaries
 * with data-dependent tail content), use `assertScrollable` instead.
 */
export async function assertBottomReachable(
  page: Page,
  bottomTestId: string,
  opts: AssertBottomReachableOptions = {}
): Promise<void> {
  const bottom = page.getByTestId(bottomTestId);
  await expect(
    bottom,
    `bottom marker "${bottomTestId}" must be attached to the DOM`
  ).toBeAttached();

  await assertScrollable(page, opts);

  await bottom.scrollIntoViewIfNeeded();
  await expect(
    bottom,
    `bottom marker "${bottomTestId}" must be at least 50% in the viewport after scrolling`
  ).toBeInViewport({ ratio: 0.5 });
}
