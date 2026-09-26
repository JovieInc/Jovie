/**
 * Regression guard for the constrained Presence table surface.
 *
 * The final profile row must remain reachable after scrolling the table's
 * remaining-height container, including its secondary destination line.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test \
 *     tests/e2e/profiles-final-row-layout.spec.ts --project=chromium
 */

import type { APIResponse, Locator, Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
  'Requires E2E_USE_TEST_AUTH_BYPASS=1'
);

const SHORT_VIEWPORT = { width: 1280, height: 640 };
const TALL_VIEWPORT = { width: 1280, height: 900 };

type ClippingAncestorMetrics = {
  readonly bottom: number;
  readonly top: number;
};

type FinalRowMetrics = {
  readonly clientHeight: number;
  readonly clippingAncestors: ReadonlyArray<ClippingAncestorMetrics>;
  readonly contentState: 'rows';
  readonly display: string;
  readonly flex: string;
  readonly minHeight: string;
  readonly overflowY: string;
  readonly rowCount: number;
  readonly rowBottom: number;
  readonly rowTop: number;
  readonly scrollOwner: string;
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly secondaryBottom: number;
  readonly secondaryTop: number;
};

async function readFinalRowMetrics(table: Locator): Promise<FinalRowMetrics> {
  const scrollContainer = table.locator('..');
  return scrollContainer.evaluate(async element => {
    const container = element as HTMLElement;
    container.scrollTop = container.scrollHeight;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const finalRow = rows.at(-1);
    const secondaryLine = finalRow?.querySelector<HTMLElement>(
      'td:first-child [data-testid="presence-page-identity"]'
    );
    if (!finalRow || !secondaryLine) {
      throw new Error(
        'Presence table did not render a final row with a destination line.'
      );
    }

    const rowRect = finalRow.getBoundingClientRect();
    const secondaryRect = secondaryLine.getBoundingClientRect();
    const clippingAncestors: ClippingAncestorMetrics[] = [];
    for (
      let ancestor: HTMLElement | null = container;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
      if (!/(auto|clip|hidden|scroll)/.test(overflow)) continue;

      const ancestorRect = ancestor.getBoundingClientRect();
      clippingAncestors.push({
        bottom: ancestorRect.bottom,
        top: ancestorRect.top,
      });
    }

    return {
      clientHeight: container.clientHeight,
      clippingAncestors,
      contentState: 'rows',
      display: getComputedStyle(container).display,
      flex: getComputedStyle(container).flex,
      minHeight: getComputedStyle(container).minHeight,
      overflowY: getComputedStyle(container).overflowY,
      rowCount: rows.length,
      rowBottom: rowRect.bottom,
      rowTop: rowRect.top,
      scrollOwner: `${container.tagName.toLowerCase()}.${container.className}`,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      secondaryBottom: secondaryRect.bottom,
      secondaryTop: secondaryRect.top,
    };
  });
}

/**
 * Captures the first real `/api/suggestions` response body in the test
 * process. Reading it later through `Response.json()` asks Chromium for the
 * body, which it evicts once the page navigates or reloads (the auth redirect
 * chain lands on /app/profiles), failing with `Network.getResponseBody: No data
 * found`. The request still reaches the real server; the response is passed
 * through unchanged.
 */
async function captureFirstSuggestionsResponse(
  page: Page
): Promise<Promise<{ readonly status: number; readonly body: string }>> {
  let resolveCapture: (value: {
    readonly status: number;
    readonly body: string;
  }) => void = () => {};
  const captured = new Promise<{
    readonly status: number;
    readonly body: string;
  }>(resolve => {
    resolveCapture = resolve;
  });
  await page.route(
    url => url.pathname === '/api/suggestions',
    async route => {
      let fetched: { response: APIResponse; body: string };
      try {
        const response = await route.fetch();
        fetched = { response, body: await response.text() };
      } catch {
        // The page tore the request down (navigation/close) before the body
        // arrived; let a later /api/suggestions request provide the capture.
        await route.continue().catch(() => {});
        return;
      }
      resolveCapture({ status: fetched.response.status(), body: fetched.body });
      await route.fulfill({ response: fetched.response, body: fetched.body });
    }
  );
  return captured;
}

function logMetrics(label: string, metrics: FinalRowMetrics) {
  console.log(`[profiles-final-row-layout] ${label}`, JSON.stringify(metrics));
}

function expectFinalRowWithinClippingAncestors(metrics: FinalRowMetrics) {
  for (const ancestor of metrics.clippingAncestors) {
    expect(metrics.rowTop).toBeGreaterThanOrEqual(ancestor.top - 1);
    expect(metrics.rowBottom).toBeLessThanOrEqual(ancestor.bottom + 1);
    expect(metrics.secondaryTop).toBeGreaterThanOrEqual(ancestor.top - 1);
    expect(metrics.secondaryBottom).toBeLessThanOrEqual(ancestor.bottom + 1);
  }
}

test('keeps the final profile row and destination line visible in a constrained panel', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await setTestAuthBypassSession(page, 'creator-ready');
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.PROFILES)}`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 }
  );
  await page.waitForURL(/\/app\/profiles(?:$|\?)/, { timeout: 60_000 });

  const workspace = page.getByTestId('profiles-workspace');
  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'All Pages', exact: true }).click();
  const table = workspace.getByRole('table');
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator('tbody tr').first()).toBeVisible({
    timeout: 30_000,
  });

  await page.setViewportSize(SHORT_VIEWPORT);
  const baselineMetrics = await readFinalRowMetrics(table);
  logMetrics('baseline', baselineMetrics);

  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&fixture=profiles-final-row&redirect=${encodeURIComponent(APP_ROUTES.PROFILES)}`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 }
  );
  await page.waitForURL(/\/app\/profiles(?:$|\?)/, { timeout: 60_000 });
  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.locator('tbody tr').first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'All Pages', exact: true }).click();
  const shortMetrics = await readFinalRowMetrics(table);
  logMetrics('short', shortMetrics);
  expect(shortMetrics.scrollHeight).toBeGreaterThan(shortMetrics.clientHeight);
  expectFinalRowWithinClippingAncestors(shortMetrics);

  const finalRow = table.locator('tbody tr').last();
  await expect(finalRow).toBeVisible();
  await finalRow.click();
  await expect(finalRow).toHaveAttribute('aria-selected', 'true');

  const firstRow = table.locator('tbody tr').first();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  await expect(finalRow).not.toHaveAttribute('aria-selected', 'true');
  await finalRow.focus();
  await expect(finalRow).toBeFocused();
  await finalRow.press('Enter');
  await expect(finalRow).toHaveAttribute('aria-selected', 'true');

  await page.setViewportSize(TALL_VIEWPORT);
  const tallMetrics = await readFinalRowMetrics(table);
  logMetrics('tall', tallMetrics);
  expectFinalRowWithinClippingAncestors(tallMetrics);
});

test('keeps page identity and review status readable at narrow widths', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setTestAuthBypassSession(page, 'creator-ready');
  const suggestionsResponse = await captureFirstSuggestionsResponse(page);
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&fixture=profiles-final-row&redirect=${encodeURIComponent(APP_ROUTES.PROFILES)}`
  );
  await page.waitForURL(/\/app\/profiles(?:$|\?)/);
  const response = await suggestionsResponse;
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({
    success: true,
    suggestions: expect.any(Array),
  });
  await page.getByRole('button', { name: 'Suggested', exact: true }).click();
  await expect(page.getByTestId('suggested-connections-review')).toBeVisible();
  await expect(
    page.getByTestId('suggested-connections-error-state')
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'All Pages', exact: true }).click();
  const workspace = page.getByTestId('profiles-workspace');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const table = workspace.getByRole('table');
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow.getByTestId('presence-page-identity')).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`presence-before-${width}.png`),
      fullPage: true,
    });
    const bounds = await table.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    if (width < 640) {
      await expect(
        table.getByRole('columnheader', { name: 'Status', exact: true })
      ).toBeHidden();
      const identityBounds = await firstRow.locator('td').first().boundingBox();
      expect(identityBounds!.width).toBeGreaterThan(200);
    }
    await firstRow.focus();
    await firstRow.press('Enter');
    if (width < 640) {
      await expect(
        page.getByRole('dialog', { name: 'Presence details' })
      ).toBeVisible();
    } else {
      await expect(firstRow).toHaveAttribute('aria-selected', 'true');
    }
    await page.screenshot({
      path: test.info().outputPath(`presence-${width}.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(table).toBeVisible();
  }
});
