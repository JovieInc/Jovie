/**
 * Visual baselines for the service dial at 390x844 (Tim's three real services
 * and the synthetic 100-destination list) against /dev/dsp-dial.
 */
import { expect, test } from '@playwright/test';
import {
  dialUrl,
  INSTRUMENT_SCRIPT,
  settled,
  sleep,
  streamIndex,
} from './dsp-dial.helpers';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

async function open(
  page: import('@playwright/test').Page,
  fixture: 'tim' | 'synthetic'
) {
  await page.addInitScript(INSTRUMENT_SCRIPT);
  await page.goto(dialUrl(fixture, 100), { waitUntil: 'networkidle' });
  const dial = page.getByTestId('action-dial');
  await expect(dial.locator('[data-dsp-provider]')).toBeVisible();
  await sleep(250);
  return dial;
}

test.describe('dsp dial: visual baseline', () => {
  test('tim fixture at rest', async ({ page }) => {
    const dial = await open(page, 'tim');
    await expect(dial).toHaveScreenshot('dsp-dial-tim-390.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
  test('synthetic 100-destination fixture mid-list', async ({ page }) => {
    const dial = await open(page, 'synthetic');
    await dial.getByRole('listbox').focus();
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await settled(() => streamIndex(dial), 600);
    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await expect(dial).toHaveScreenshot('dsp-dial-synthetic-390.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
});
