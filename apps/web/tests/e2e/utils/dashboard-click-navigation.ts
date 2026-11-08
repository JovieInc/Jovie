import { type ConsoleMessage, expect, type Page } from '@playwright/test';

/**
 * Click-driven dashboard navigation proof.
 *
 * `page.goto` proves a dashboard route renders on a full document load. It
 * never exercises the App Router's client-side transition, so a shell whose
 * sidebar links stop moving between pages still passes every goto-based tab
 * check. This helper clicks the sidebar's own links from the signed-in
 * dashboard and requires each click to change the route without a full
 * document reload.
 */

const SIDEBAR_LINK = 'a[data-navigation-item-id][href^="/app"]';
const MAX_DESTINATIONS = 4;
const ROUTE_CHANGE_TIMEOUT_MS = 15_000;
const CLICK_TIMEOUT_MS = 10_000;

export interface ClickNavigationResult {
  readonly href: string;
  readonly fromPath: string;
  readonly finalPath: string;
  readonly moved: boolean;
  readonly hardReload: boolean;
  readonly clickError?: string;
  readonly topElementAtLink?: string;
}

function pathOf(href: string, origin: string): string {
  return new URL(href, origin).pathname;
}

async function describeTopElement(
  page: Page,
  selector: string
): Promise<string | undefined> {
  return page
    .evaluate(sel => {
      const link = document.querySelector(sel);
      if (!link) return 'link missing';
      const box = link.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
      if (!top) return 'nothing at link center';
      if (top === link || link.contains(top)) return 'link itself';
      const id = top.id ? `#${top.id}` : '';
      const testId = top.getAttribute('data-testid');
      return `${top.tagName.toLowerCase()}${id}${testId ? `[data-testid=${testId}]` : ''}`;
    }, selector)
    .catch(() => undefined);
}

/**
 * Click up to four sidebar destinations in turn and fail with a diagnostic
 * (per-click outcome, the element covering the link, page errors) when any
 * click leaves the route unchanged or falls back to a hard reload.
 */
export async function assertSidebarClickNavigation(
  page: Page,
  origin: string,
  minDestinations = 2
): Promise<readonly ClickNavigationResult[]> {
  const errors: string[] = [];
  const onPageError = (error: Error) =>
    errors.push(`pageerror: ${error.message.slice(0, 300)}`);
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text().slice(0, 300)}`);
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  const results: ClickNavigationResult[] = [];
  try {
    // Start from a full document load of the dashboard, the way a returning
    // creator opens it, so the client runtime (router, monitoring SDK) boots
    // on a dashboard route rather than on the sign-in page.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.locator(SIDEBAR_LINK).first(),
      'Dashboard sidebar links should render'
    ).toBeVisible({ timeout: 30_000 });

    const hrefs = await page
      .locator(SIDEBAR_LINK)
      .evaluateAll(nodes =>
        nodes
          .filter(node => (node as HTMLElement).offsetParent !== null)
          .map(node => node.getAttribute('href') ?? '')
      );
    const startPath = new URL(page.url()).pathname;
    const seen = new Set<string>([startPath]);
    const targets: string[] = [];
    for (const href of hrefs) {
      const path = pathOf(href, origin);
      if (seen.has(path)) continue;
      seen.add(path);
      targets.push(href);
      if (targets.length >= MAX_DESTINATIONS) break;
    }
    expect(
      targets.length,
      `Expected at least ${minDestinations} sidebar destinations, saw ${JSON.stringify(hrefs)}`
    ).toBeGreaterThanOrEqual(minDestinations);

    for (const href of targets) {
      const fromPath = new URL(page.url()).pathname;
      const selector = `${SIDEBAR_LINK.replace('[href^="/app"]', '')}[href="${href}"]`;
      await page.evaluate(() => {
        (window as unknown as { __jovieClickNav?: boolean }).__jovieClickNav =
          true;
      });
      const topElementAtLink = await describeTopElement(page, selector);
      let clickError: string | undefined;
      await page
        .locator(selector)
        .first()
        .click({ timeout: CLICK_TIMEOUT_MS })
        .catch((error: Error) => {
          clickError = error.message.split('\n')[0]?.slice(0, 300);
        });
      const moved = await page
        .waitForURL(
          url =>
            url.origin === origin &&
            url.pathname !== fromPath &&
            !url.pathname.includes('sign-in') &&
            !url.pathname.includes('signin'),
          { timeout: ROUTE_CHANGE_TIMEOUT_MS }
        )
        .then(() => true)
        .catch(() => false);
      const hardReload = moved
        ? await page
            .evaluate(
              () =>
                (window as unknown as { __jovieClickNav?: boolean })
                  .__jovieClickNav !== true
            )
            .catch(() => false)
        : false;
      results.push({
        href,
        fromPath,
        finalPath: new URL(page.url()).pathname,
        moved,
        hardReload,
        ...(clickError ? { clickError } : {}),
        ...(topElementAtLink ? { topElementAtLink } : {}),
      });
      if (!moved) break;
    }

    const failed = results.filter(result => !result.moved || result.hardReload);
    expect(
      failed,
      `Sidebar click navigation failed.\nResults: ${JSON.stringify(results)}\nPage errors: ${JSON.stringify(errors.slice(0, 10))}`
    ).toEqual([]);
    return results;
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}
