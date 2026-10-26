/**
 * E2E: cookie banner is geo-gated end to end (proxy geo header -> jv_cc_required
 * cookie -> client mount) and fails closed when the geo signal is missing.
 *
 * Unlike cookies.spec.ts this does NOT preseed jv_cc_required: the proxy has to
 * derive it from the request headers.
 *
 * @smoke
 */
import { expect, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 390, height: 844 },
});

const CASES = [
  { name: 'DE (EU)', headers: { 'x-vercel-ip-country': 'DE' }, visible: true },
  { name: 'GB', headers: { 'x-vercel-ip-country': 'GB' }, visible: true },
  {
    name: 'US-TX (no consent law)',
    headers: {
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-country-region': 'TX',
    },
    visible: false,
  },
  { name: 'JP', headers: { 'x-vercel-ip-country': 'JP' }, visible: false },
  {
    name: 'missing geo (fail closed)',
    // Overrides the suite-wide default US/TX geo with an empty signal.
    headers: { 'x-vercel-ip-country': '', 'x-vercel-ip-country-region': '' },
    visible: true,
  },
  {
    name: 'unknown XX (fail closed)',
    headers: { 'x-vercel-ip-country': 'XX' },
    visible: true,
  },
] as const;

for (const { name, headers, visible } of CASES) {
  test(`cookie banner geo gate: ${name} -> ${visible ? 'shown' : 'hidden'} @smoke`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setExtraHTTPHeaders({ ...headers });
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const banner = page.getByTestId('cookie-banner');
    if (!visible) {
      await page.waitForTimeout(1500);
      await expect(banner).toHaveCount(0);
      return;
    }

    await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    const box = await banner.boundingBox();
    expect(box).not.toBeNull();
    // Phone bottom sheet: full width, docked to the viewport bottom.
    expect(box!.width).toBeGreaterThanOrEqual(388);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(843);
    for (const label of ['Reject all', 'Accept all', 'Customize']) {
      const hit = await banner
        .getByRole('button', { name: label, exact: true })
        .evaluate(el => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        });
      // The visible face is 28px; the interactive target is expanded to 44.
      expect(hit.w).toBeGreaterThan(40);
    }
  });
}
