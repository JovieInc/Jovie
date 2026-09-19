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

import type { Locator } from '@playwright/test';
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
      'td:first-child [title^="http"]'
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
