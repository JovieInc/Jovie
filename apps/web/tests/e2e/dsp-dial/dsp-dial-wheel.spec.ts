import { expect, test } from '@playwright/test';
import {
  dialUrl,
  INSTRUMENT_SCRIPT,
  settled,
  sleep,
  streamIndex,
} from './dsp-dial.helpers';

test.use({ viewport: { width: 1024, height: 800 }, hasTouch: false });

test.describe('dsp dial: wheel and trackpad', () => {
  test('a mouse wheel notch moves one item and stays consistent', async ({
    page,
  }) => {
    await page.addInitScript(INSTRUMENT_SCRIPT);
    await page.goto(dialUrl('synthetic'), { waitUntil: 'networkidle' });
    const dial = page.getByTestId('action-dial');
    await expect(dial.locator('[data-dsp-provider]')).toBeVisible();
    await sleep(250);
    const box = (await dial.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.wheel(0, 100);
    const one = await settled(() => streamIndex(dial), 500);
    expect(one).toBeGreaterThanOrEqual(1);
    await page.mouse.wheel(0, -100);
    const back = await settled(() => streamIndex(dial), 500);
    expect(back).toBeLessThan(one);
  });

  test('a trackpad stream of small deltas scrolls continuously then snaps', async ({
    page,
  }) => {
    await page.addInitScript(INSTRUMENT_SCRIPT);
    await page.goto(dialUrl('synthetic'), { waitUntil: 'networkidle' });
    const dial = page.getByTestId('action-dial');
    await expect(dial.locator('[data-dsp-provider]')).toBeVisible();
    await sleep(250);
    const box = (await dial.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    // Dispatched in-page at display rate, as a trackpad streams them.
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          const target = document.querySelector('[data-testid="action-dial"]')!;
          let sent = 0;
          const timer = setInterval(() => {
            target.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: 14,
                bubbles: true,
                cancelable: true,
              })
            );
            if (++sent === 30) {
              clearInterval(timer);
              resolve();
            }
          }, 12);
        })
    );
    const index = await settled(() => streamIndex(dial), 600);
    // 30 * 14px = 420px = 7.5 rows of travel.
    expect(index).toBeGreaterThanOrEqual(6);
    expect(index).toBeLessThanOrEqual(9);
    await expect(dial).toHaveAttribute('data-position', String(index));
  });
});
