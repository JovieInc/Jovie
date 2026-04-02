import { expect, test } from '@playwright/test';
import {
  assertNoDevOverlays,
  OUTPUT_DIR,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Onboarding', () => {
  test('onboarding shell – sidebar progress', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/demo/onboarding', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const shell = page.getByTestId('demo-onboarding-app-shell');
    await expect(shell).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await waitForImages(page).catch(() => {});
    await waitForSettle(page, 2500);
    await assertNoDevOverlays(page);

    await shell.screenshot({
      path: `${OUTPUT_DIR}/onboarding-shell.png`,
    });
    console.log('📸 Saved: onboarding-shell.png');
  });
});
