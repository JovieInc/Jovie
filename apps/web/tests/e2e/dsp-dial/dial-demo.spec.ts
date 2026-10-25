/**
 * Landing-page dial demo (DialDemo): scroll reveal, interrupt, manual drag,
 * reduced motion, no outbound links, layout stability and a long-task budget,
 * against the development-only /dev/dial-demo harness (dial below the fold).
 */
import { expect, type Page, test } from '@playwright/test';
import {
  drag,
  INSTRUMENT_SCRIPT,
  openGesture,
  sleep,
  touchEnd,
  touchStart,
} from './dsp-dial.helpers';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

const CLS_SCRIPT = `
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
`;

async function openDemo(page: Page) {
  await page.addInitScript(INSTRUMENT_SCRIPT);
  await page.addInitScript(CLS_SCRIPT);
  await page.goto('/dev/dial-demo', { waitUntil: 'networkidle' });
  return page.getByTestId('dial-demo');
}

const position = (page: Page) =>
  page
    .getByTestId('action-dial')
    .getAttribute('data-position')
    .then(value => Number(value));

async function scrollToDial(page: Page) {
  const host = page.getByTestId('dial-demo');
  await host.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('action-dial')).toBeVisible();
}

test.describe('dial demo: reveal and control', () => {
  test('is lazy: nothing mounts until it nears the viewport', async ({
    page,
  }) => {
    await openDemo(page);
    await expect(page.getByTestId('action-dial')).toHaveCount(0);
    await scrollToDial(page);
    await expect(page.getByTestId('action-dial')).toHaveCount(1);
  });

  test('plays one fling past several services, then lands back on Spotify', async ({
    page,
  }) => {
    await openDemo(page);
    await scrollToDial(page);
    const action = page.locator('[data-dsp-provider]');
    await expect(action).toHaveAttribute('aria-label', /Spotify/);
    await expect
      .poll(() => position(page), { timeout: 6000 })
      .toBeGreaterThan(3);
    await expect
      .poll(() => position(page), { timeout: 20000, intervals: [250] })
      .toBe(0);
    await expect(action).toHaveAttribute('aria-label', /Spotify/);
  });

  test('a touch mid-reveal stops it and hands control to the user', async ({
    page,
  }) => {
    await openDemo(page);
    await scrollToDial(page);
    const box = (await page.getByTestId('action-dial').boundingBox())!;
    await expect
      .poll(() => position(page), { timeout: 6000 })
      .toBeGreaterThan(2);
    const cdp = await openGesture(page);
    await touchStart(cdp, box.x + box.width / 2, box.y + 190);
    const held = await position(page);
    await sleep(1500);
    expect(await position(page)).toBe(held);
    await touchEnd(cdp);
    await sleep(2500);
    // It never resumes the scripted fling after the user took over.
    const settled = await position(page);
    await sleep(4000);
    expect(await position(page)).toBe(settled);
    expect(Number.isInteger(settled)).toBe(true);
  });

  test('the user can flick it by hand and nothing outbound exists', async ({
    page,
  }) => {
    await openDemo(page);
    await scrollToDial(page);
    const box = (await page.getByTestId('action-dial').boundingBox())!;
    const cdp = await openGesture(page);
    await touchStart(cdp, box.x + box.width / 2, box.y + 190);
    await touchEnd(cdp);
    await sleep(600);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 22,
      ms: 70,
    });
    await expect
      .poll(() => position(page), { timeout: 8000 })
      .toBeGreaterThan(3);
    await expect(page.getByTestId('dial-demo').locator('a[href]')).toHaveCount(
      0
    );
    // Let the coast finish: a touch that catches momentum only stops it.
    await expect
      .poll(async () => (await position(page)) % 1, { timeout: 12000 })
      .toBe(0);
    await sleep(800);
    const before = page.url();
    await page.locator('[data-dsp-provider]').tap();
    await expect(
      page.getByText('This is a demo. No link opens.')
    ).toBeVisible();
    expect(page.url()).toBe(before);
  });

  test('keyboard works exactly as on the release page', async ({ page }) => {
    await openDemo(page);
    await scrollToDial(page);
    const listbox = page.getByRole('listbox');
    await listbox.focus();
    await page.keyboard.press('End');
    await expect.poll(() => position(page), { timeout: 8000 }).toBe(11);
    await page.keyboard.press('Home');
    await expect.poll(() => position(page), { timeout: 8000 }).toBe(0);
  });
});

test.describe('dial demo: reduced motion', () => {
  test('is static until touched, and still draggable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDemo(page);
    await scrollToDial(page);
    await sleep(3500);
    expect(await position(page)).toBe(0);
    await page.getByRole('listbox').focus();
    await page.keyboard.press('End');
    await expect.poll(() => position(page), { timeout: 3000 }).toBe(11);
  });
});

test.describe('dial demo: performance budget', () => {
  test('no layout shift and no long task over 50ms through mount and reveal', async ({
    page,
  }) => {
    await openDemo(page);
    const initialHeight = await page
      .getByTestId('dial-demo')
      .evaluate(el => el.getBoundingClientRect().height);
    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks.length = 0;
    });
    await scrollToDial(page);
    await expect
      .poll(() => position(page), { timeout: 6000 })
      .toBeGreaterThan(3);
    await expect
      .poll(() => position(page), { timeout: 20000, intervals: [250] })
      .toBe(0);
    const mountedHeight = await page
      .getByTestId('dial-demo')
      .evaluate(el => el.getBoundingClientRect().height);
    expect(Math.abs(mountedHeight - initialHeight)).toBeLessThanOrEqual(1);
    const { cls, longTasks } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __longTasks: number[] };
      return { cls: w.__cls, longTasks: [...w.__longTasks] };
    });
    expect(cls, `layout shift ${cls}`).toBeLessThan(0.01);
    expect(
      Math.max(0, ...longTasks),
      `long tasks ${longTasks.join(',')}`
    ).toBeLessThanOrEqual(50);
  });
});

test.describe('dial demo: desktop', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
  });
  test('reveals on scroll and can be dragged with the mouse', async ({
    page,
  }) => {
    await openDemo(page);
    await scrollToDial(page);
    await expect
      .poll(() => position(page), { timeout: 6000 })
      .toBeGreaterThan(3);
    const box = (await page.getByTestId('action-dial').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 170);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 12 });
    await page.mouse.up();
    await sleep(3500);
    const rested = await position(page);
    expect(Number.isInteger(rested)).toBe(true);
    await sleep(3000);
    expect(await position(page)).toBe(rested);
  });
});
