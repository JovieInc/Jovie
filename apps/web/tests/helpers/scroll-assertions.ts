import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface ScrollAssertionOptions {
  /**
   * CSS selector for the element that owns the scroll. Defaults to the
   * document scrolling element. For app-shell routes, scroll lives on a
   * route-owned pane inside the shell clip — pass that pane's selector, not
   * `[data-testid="app-shell-scroll"]` (the shell clip itself does not scroll).
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

  // Client panels on data-heavy routes (e.g. /hud) resolve after `load` and
  // reflow the page. Measure the precondition against settled layout rather
  // than whatever frame happened to be current when navigation resolved.
  await waitForStableScrollHeight(page, containerSelector);

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

  // A single wheel followed by a fixed 80ms read raced post-load work on the
  // first, cold navigation of a CI run: the scroll position was sampled (or
  // reset by a client re-render) before it settled, so `scrollTop` read 0 even
  // though the page scrolls. Instead, send real wheel input and poll until it
  // moves `scrollTop`, re-sending the wheel if an earlier one was lost.
  // A genuine `overflow: hidden` trap never moves `scrollTop` no matter how
  // many wheels land, so this still fails on the regression it guards.
  let after = before;
  try {
    await expect(async () => {
      await page.mouse.wheel(0, wheelDelta);
      await expect
        .poll(
          async () => {
            after = await readScrollMetrics(page, containerSelector);
            return after.scrollTop;
          },
          { timeout: WHEEL_SETTLE_TIMEOUT_MS }
        )
        .toBeGreaterThan(before.scrollTop);
    }).toPass({ timeout: WHEEL_SCROLL_TIMEOUT_MS });
  } catch {
    const diagnostics = await readScrollDiagnostics(page, containerSelector);
    expect(
      after.scrollTop,
      `real wheel scroll must change scrollTop (overflow:hidden traps the user even though scrollIntoView appears to work); ${diagnostics}`
    ).toBeGreaterThan(before.scrollTop);
  }
}

/** Per-wheel window for the scroll position to update before re-sending. */
const WHEEL_SETTLE_TIMEOUT_MS = 1_000;
/** Total budget for real wheel input to move the scroll container. */
const WHEEL_SCROLL_TIMEOUT_MS = 10_000;
/** Budget for late client panels to stop reflowing before measuring. */
const LAYOUT_SETTLE_TIMEOUT_MS = 5_000;
const LAYOUT_SETTLE_SAMPLE_MS = 150;

/**
 * Waits (bounded) until the scroll container's `scrollHeight` is unchanged
 * across two consecutive samples. Chatty routes that never fully settle fall
 * through after the budget; the assertions that follow still decide the test.
 */
async function waitForStableScrollHeight(
  page: Page,
  containerSelector: string | null
): Promise<void> {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const { scrollHeight } = await readScrollMetrics(
          page,
          containerSelector
        );
        const stable = scrollHeight === previous;
        previous = scrollHeight;
        return stable;
      },
      {
        timeout: LAYOUT_SETTLE_TIMEOUT_MS,
        intervals: [LAYOUT_SETTLE_SAMPLE_MS],
      }
    )
    .toBe(true)
    .catch(() => {});
}

/** Describes why a scroll container did not move, for the failure message. */
async function readScrollDiagnostics(
  page: Page,
  containerSelector: string | null
): Promise<string> {
  return page
    .evaluate(sel => {
      const el = sel
        ? (document.querySelector(sel) as HTMLElement | null)
        : (document.scrollingElement as HTMLElement | null);
      if (!el) return 'scroll container missing';
      const describe = (node: Element) => {
        const style = globalThis.getComputedStyle(node);
        return `${node.tagName.toLowerCase()}{overflow-y:${style.overflowY};height:${style.height}}`;
      };
      return [
        `container=${describe(el)}`,
        `html=${describe(document.documentElement)}`,
        `body=${describe(document.body)}`,
        `scrollTop=${el.scrollTop}`,
        `scrollHeight=${el.scrollHeight}`,
        `clientHeight=${el.clientHeight}`,
      ].join(' ');
    }, containerSelector)
    .catch(error => `diagnostics unavailable: ${String(error)}`);
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
