/**
 * Releases view first paint stays put.
 *
 * The releases view (/app/library?view=releases) shows an Apple Music banner
 * above its list. When the banner's data arrived from a client read after
 * the list painted, the banner pushed the whole list down (Lighthouse layout
 * shift 0.075 against the 0.06 budget). The library page now reads that data
 * on the server, so the banner is in the first paint. This spec fails if the
 * list's scroll container moves after it first appears, or if any layout
 * shift lands inside the releases matrix.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/releases-first-paint-visual.spec.ts --config=playwright.config.noauth.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

// This spec is a merge gate. A runner without the persona bypass must fail
// loudly instead of skipping, because a skipped gate reads as green.
test.beforeAll(() => {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
    throw new Error(
      'releases-first-paint-visual needs E2E_USE_TEST_AUTH_BYPASS=1 and a database'
    );
  }
});

const RELEASES_URL = `${APP_ROUTES.LIBRARY}?view=releases`;
const MATRIX = '[data-testid="releases-matrix"]';
const ROUTE_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1_500;

interface FirstPaintProbe {
  readonly firstTop: number | null;
  readonly shifts: { readonly value: number; readonly inMatrix: boolean }[];
}

declare global {
  interface Window {
    __releasesFirstPaint?: {
      firstTop: number | null;
      shifts: { value: number; inMatrix: boolean }[];
    };
  }
}

test.describe('releases view first paint', () => {
  test('the release list does not move after it first paints', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Record every layout shift and the list container's first position
    // from before the document parses, so a shift during load is seen.
    await page.addInitScript(
      ({ matrix }) => {
        const probe = {
          firstTop: null as number | null,
          shifts: [] as { value: number; inMatrix: boolean }[],
        };
        window.__releasesFirstPaint = probe;
        const container = () =>
          document.querySelector<HTMLElement>(`${matrix} > .overflow-y-auto`);
        const recordFirstTop = () => {
          if (probe.firstTop !== null) return;
          const element = container();
          if (element) {
            probe.firstTop = element.getBoundingClientRect().top;
            return;
          }
          requestAnimationFrame(recordFirstTop);
        };
        requestAnimationFrame(recordFirstTop);
        try {
          new PerformanceObserver(list => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
              sources?: { node?: Node | null }[];
            })[]) {
              if (entry.hadRecentInput) continue;
              const inMatrix = (entry.sources ?? []).some(source => {
                const node = source.node;
                const element =
                  node instanceof Element
                    ? node
                    : (node?.parentElement ?? null);
                return Boolean(element?.closest(matrix));
              });
              probe.shifts.push({ value: entry.value, inMatrix });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {
          // A browser without layout-shift entries leaves shifts empty; the
          // position check below still holds the list in place.
        }
      },
      { matrix: MATRIX }
    );

    await setTestAuthBypassSession(page, 'creator-ready');
    await page.goto(
      `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(RELEASES_URL)}`,
      { waitUntil: 'load' }
    );
    await expect(page).toHaveURL(/\/app\/library\?view=releases/, {
      timeout: ROUTE_TIMEOUT_MS,
    });
    const container = page.locator(`${MATRIX} > .overflow-y-auto`);
    await expect(container).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });

    // Give late client reads (the Apple Music matches, before the fix) time
    // to land, then compare.
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);

    const probe = await page.evaluate(
      () => window.__releasesFirstPaint as FirstPaintProbe
    );
    const settledTop = await container.evaluate(
      element => element.getBoundingClientRect().top
    );

    expect(
      probe.firstTop,
      'the release list container was never seen painting'
    ).not.toBeNull();
    expect(
      Math.abs(settledTop - (probe.firstTop ?? settledTop)),
      `release list moved from ${probe.firstTop} to ${settledTop} px after first paint`
    ).toBeLessThanOrEqual(1);

    const matrixShift = probe.shifts
      .filter(shift => shift.inMatrix)
      .reduce((total, shift) => total + shift.value, 0);
    expect(
      matrixShift,
      `layout shift inside the releases matrix: ${JSON.stringify(probe.shifts)}`
    ).toBeLessThan(0.01);
  });
});
