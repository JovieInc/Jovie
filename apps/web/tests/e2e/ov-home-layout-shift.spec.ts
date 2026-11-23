/**
 * Ovie Home must not move unless Tim acts (Tim 2026-11-22: "so much ui
 * jumping around with no user interaction").
 *
 * Loads /app/ov as the admin persona with every Home data source delayed (so
 * placeholders are on screen first and real data lands late), records
 * `layout-shift` entries that were not caused by input for ~5s, and fails if
 * the cumulative score exceeds 0.01. Data arriving late, polls and typing in
 * the composer must all stay still.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test ov-home-layout-shift --project=chromium
 *
 * @stability
 */
import { expect, type Page, test } from '@playwright/test';

const CLS_BUDGET = 0.01;
const OBSERVE_MS = 5_000;

const DELAYED_SOURCES = [
  '**/api/ovie/home/blocker',
  '**/api/hud/metrics',
  '**/api/admin/hud/founder-funnel*',
  '**/api/ovie/certifications',
  '**/api/hud/shipping-state*',
];

test.use({ storageState: { cookies: [], origins: [] } });

async function installShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = globalThis as unknown as { __ovCls: { value: number } };
    w.__ovCls = { value: 0 };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) w.__ovCls.value += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

test('ovie home has no unprompted layout shift', async ({ page }) => {
  test.setTimeout(120_000);
  await installShiftObserver(page);

  // Late data: responses are held until the placeholders are on screen, then
  // released together so real data lands after first paint.
  let releaseData: () => void = () => undefined;
  const dataGate = new Promise<void>(resolve => {
    releaseData = resolve;
  });
  for (const pattern of DELAYED_SOURCES) {
    await page.route(pattern, async route => {
      await dataGate;
      await route.continue();
    });
  }

  const provision = await page.request.post('/api/dev/test-auth/session', {
    data: { persona: 'admin' },
  });
  expect(provision.ok()).toBe(true);
  await page.goto(
    `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent('/app/ov')}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.getByTestId('story-first-canvas')).toBeVisible({
    timeout: 60_000,
  });

  await expect(page.getByTestId('story-first-stages')).toBeVisible();
  releaseData();
  await page.waitForTimeout(OBSERVE_MS);

  const cls = await page.evaluate(
    () =>
      (globalThis as unknown as { __ovCls: { value: number } }).__ovCls.value
  );
  expect(
    cls,
    `unprompted cumulative layout shift ${cls.toFixed(4)} > ${CLS_BUDGET}`
  ).toBeLessThanOrEqual(CLS_BUDGET);
});
