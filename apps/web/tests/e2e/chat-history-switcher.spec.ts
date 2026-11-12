/**
 * Signed-in chat breadcrumb switcher: open, search, select and close, plus
 * the no-jank contract (the title never moves, opening shifts no layout and
 * drops no frames, the list fades only while rows are clipped below).
 *
 * History is served from a fixture so the rows, order and target URL are
 * deterministic; everything else (shell, header, menu) is the real app.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/chat-history-switcher.spec.ts --config=playwright.config.noauth.ts --project=chromium
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';

const TRIGGER = '[data-testid="chat-history-trigger"]';
const MENU = '[data-slot="common-dropdown-content"]';
const SCROLL_BODY = '[data-slot="common-dropdown-scroll-body"]';
const SEARCH = 'input[placeholder="Chat History"]';

const NOW = Date.now();
const FIXTURE_CHATS = Array.from({ length: 24 }, (_, index) => {
  const updatedAt = new Date(NOW - (index + 1) * 36 * 3_600_000).toISOString();
  return {
    id: `e2e-history-${index}`,
    title: index === 5 ? 'Spring Release Plan' : `History Fixture ${index}`,
    createdAt: updatedAt,
    updatedAt,
    latestMessageRole: 'user',
    latestTurnStatus: 'completed',
  };
});

test.use({ storageState: { cookies: [], origins: [] } });
// Merge gate: fail rather than skip when the test-auth bypass is off.
test.beforeAll(() => {
  expect(
    process.env.E2E_USE_TEST_AUTH_BYPASS,
    'chat-history-switcher needs E2E_USE_TEST_AUTH_BYPASS=1'
  ).toBe('1');
});

/** Set once the fixture history has been served, whenever that happens. */
const historyServed = new WeakMap<Page, boolean>();

async function openNewChat(page: Page) {
  historyServed.set(page, false);
  await page.route('**/api/chat/conversations?*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: FIXTURE_CHATS }),
    });
    historyServed.set(page, true);
  });
  await setTestAuthBypassSession(page, 'creator-ready');
  await page.goto(APP_ROUTES.CHAT, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(TRIGGER)).toBeVisible({ timeout: 60_000 });
}

/** Layout shifts and long frames recorded from now until `stop()`. */
async function startJankProbe(page: Page) {
  await page.evaluate(() => {
    const probe = { shifts: 0, longFrames: 0, frames: 0, running: true };
    (
      globalThis as unknown as { __switcherProbe: typeof probe }
    ).__switcherProbe = probe;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        probe.shifts += (entry as unknown as { value: number }).value;
      }
    }).observe({ type: 'layout-shift', buffered: false });
    let last = performance.now();
    const tick = (now: number) => {
      if (!probe.running) return;
      probe.frames += 1;
      if (now - last > 50) probe.longFrames += 1;
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return async () =>
    page.evaluate(() => {
      const probe = (
        globalThis as unknown as {
          __switcherProbe: {
            shifts: number;
            longFrames: number;
            frames: number;
            running: boolean;
          };
        }
      ).__switcherProbe;
      probe.running = false;
      return {
        shifts: probe.shifts,
        longFrames: probe.longFrames,
        frames: probe.frames,
      };
    });
}

test('chat title opens history: search, select and close without jank', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openNewChat(page);
  const trigger = page.locator(TRIGGER);
  await expect(trigger).toHaveText(/New Chat/);

  // Hovering prefetches; wait until the history has been served (by the
  // hover or by an earlier load) so the open measures the menu only.
  await trigger.hover();
  await expect
    .poll(() => historyServed.get(page), { timeout: 30_000 })
    .toBe(true);

  const before = await trigger.boundingBox();
  const stop = await startJankProbe(page);
  await trigger.click();

  const menu = page.locator(MENU);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-motion', 'anchored');
  await expect(page.locator(SEARCH)).toBeFocused();
  // Let the enter motion finish before reading the probe.
  await page.waitForTimeout(400);
  const jank = await stop();

  expect(await trigger.boundingBox(), 'title must not move on open').toEqual(
    before
  );
  expect(jank.shifts, 'opening the switcher shifted layout').toBe(0);
  expect(jank.frames, 'probe recorded frames').toBeGreaterThan(5);
  expect(jank.longFrames, 'frames over 50ms while opening').toBeLessThanOrEqual(
    1
  );

  // Anchored under the title, left edges aligned within the pill inset.
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThan(before!.y + before!.height - 1);
  expect(Math.abs(menuBox!.x - before!.x)).toBeLessThanOrEqual(12);

  // Long list: rows below fade, search stays pinned while the list scrolls.
  const body = page.locator(SCROLL_BODY);
  await expect(menu.getByRole('menuitem')).toHaveCount(FIXTURE_CHATS.length);
  await expect(body).toHaveAttribute('data-fade-bottom', 'true');
  const searchTop = (await page.locator(SEARCH).boundingBox())!.y;
  await body.evaluate(node => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event('scroll'));
  });
  await expect(body).not.toHaveAttribute('data-fade-bottom', 'true');
  await expect(body).toHaveAttribute('data-fade-top', 'true');
  expect((await page.locator(SEARCH).boundingBox())!.y).toBe(searchTop);

  // Type to filter, then open the match with the keyboard.
  await page.locator(SEARCH).fill('spring');
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  await expect(body).not.toHaveAttribute('data-fade-bottom', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(
    menu.getByRole('menuitem', { name: 'Spring Release Plan' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await page.waitForURL(/\/app\/chat\/e2e-history-5$/, { timeout: 30_000 });
});

test('Escape clears the search, then closes and returns focus to the title', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openNewChat(page);
  const trigger = page.locator(TRIGGER);
  await trigger.click();
  const menu = page.locator(MENU);
  await expect(page.locator(SEARCH)).toBeFocused();

  await page.locator(SEARCH).fill('zzz-no-match');
  await expect(menu).toContainText('No Matching Chats');
  await page.keyboard.press('Escape');
  await expect(page.locator(SEARCH)).toHaveValue('');
  await expect(menu).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/app\/chat$/);
});

test('fits a phone screen without horizontal scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openNewChat(page);
  await page.locator(TRIGGER).click();
  const menuBox = await page.locator(MENU).boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
