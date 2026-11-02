/**
 * Release-page service dial: real touch, keyboard and wheel input at 390x844
 * against the development-only harness (/dev/dsp-dial), with Tim's real
 * three-service fixture and a synthetic 100-destination fixture.
 *
 * Run (against a running dev server):
 *   BASE_URL=http://localhost:3100 pnpm --filter @jovie/web exec playwright \
 *     test --config=playwright.config.dsp-dial.ts
 */
import { expect, type Page, test } from '@playwright/test';
import {
  dialBox,
  dialUrl,
  drag,
  INSTRUMENT_SCRIPT,
  openGesture,
  ROW_STEP_PX,
  settled,
  sleep,
  streamIndex,
  streamLabel,
  touchEnd,
  touchStart,
} from './dsp-dial.helpers';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

async function open(page: Page, fixture: 'tim' | 'synthetic', count = 100) {
  await page.addInitScript(INSTRUMENT_SCRIPT);
  await page.goto(dialUrl(fixture, count), { waitUntil: 'networkidle' });
  const dial = page.getByTestId('action-dial');
  await expect(dial).toBeVisible();
  // Hydrated once reduced-motion has resolved and the action is rendered.
  await expect(dial.locator('[data-dsp-provider]')).toBeVisible();
  await sleep(250);
  return dial;
}

test.describe('dsp dial: touch', () => {
  test('tim fixture: a slow one-row drag selects the next service', async ({
    page,
  }) => {
    const dial = await open(page, 'tim');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 170,
      toY: box.y + 170 - ROW_STEP_PX,
      ms: 500,
      restMs: 140,
    });
    await settled(() => page.getByTestId('dial-selected').innerText());
    await expect(page.getByTestId('dial-selected')).toHaveText('apple_music');
    await expect(dial.locator('[data-dsp-provider]')).toHaveAttribute(
      'aria-label',
      'Stream Now with Apple Music'
    );
  });

  test('a short drag that does not reach halfway returns to the start', async ({
    page,
  }) => {
    const dial = await open(page, 'tim');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 170,
      toY: box.y + 170 - 18,
      ms: 300,
      restMs: 140,
    });
    await settled(() => streamLabel(dial));
    await expect(page.getByTestId('dial-selected')).toHaveText('spotify');
  });

  test('a flick on 100 destinations coasts many rows and lands on the item Stream Now shows', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    // About 168px in 70ms: roughly 2.4px/ms, projecting a long throw.
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 22,
      ms: 70,
    });
    const index = await settled(() => streamIndex(dial), 600);
    expect(index).toBeGreaterThan(8);
    const id = `dest-${String(index + 1).padStart(3, '0')}`;
    await expect(page.getByTestId('dial-selected')).toHaveText(id);
    await expect(dial.locator('[role="listbox"]')).toHaveAttribute(
      'aria-activedescendant',
      /./
    );
  });

  test('flinging back returns toward the start and never leaves the list', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    for (let i = 0; i < 3; i++) {
      await drag(cdp, {
        x: box.x + box.width / 2,
        fromY: box.y + 190,
        toY: box.y + 22,
        ms: 70,
      });
      await sleep(250);
    }
    const far = await settled(() => streamIndex(dial), 600);
    expect(far).toBeGreaterThan(12);
    for (let i = 0; i < 6; i++) {
      await drag(cdp, {
        x: box.x + box.width / 2,
        fromY: box.y + 22,
        toY: box.y + 190,
        ms: 70,
      });
      await sleep(200);
    }
    const back = await settled(() => streamIndex(dial), 600);
    expect(back).toBeLessThan(far);
    expect(back).toBeGreaterThanOrEqual(0);
  });

  test('a touch interrupts a fling immediately and holds the dial still', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    const x = box.x + box.width / 2;
    await drag(cdp, { x, fromY: box.y + 190, toY: box.y + 22, ms: 70 });
    await sleep(350);
    const mid = await streamIndex(dial);
    await touchStart(cdp, x, box.y + 190);
    await sleep(120);
    const held = await streamIndex(dial);
    await sleep(900);
    const heldLater = await streamIndex(dial);
    await touchEnd(cdp);
    expect(heldLater).toBe(held);
    expect(held).toBeGreaterThanOrEqual(mid);
    const rest = await settled(() => streamIndex(dial), 600);
    expect(Math.abs(rest - held)).toBeLessThanOrEqual(1);
  });

  test('control: the same fling keeps moving when nothing touches it', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 22,
      ms: 70,
    });
    await sleep(350);
    const early = await streamIndex(dial);
    await sleep(900);
    const later = await streamIndex(dial);
    expect(later).toBeGreaterThan(early);
  });

  test('pulling past the first item rubber-bands and springs back', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    const x = box.x + box.width / 2;
    await drag(cdp, {
      x,
      fromY: box.y + 40,
      toY: box.y + 220,
      ms: 400,
      restMs: 140,
      lift: false,
    });
    const shown = Number(await dial.getAttribute('data-position'));
    expect(shown).toBeLessThan(0);
    // 180px is ~3.2 items of raw drag; the rubber band shows well under 2.
    expect(shown).toBeGreaterThan(-2);
    await touchEnd(cdp);
    await settled(() => dial.getAttribute('data-position'));
    expect(Number(await dial.getAttribute('data-position'))).toBe(0);
    await expect(page.getByTestId('dial-selected')).toHaveText('dest-001');
  });

  test('a tap mid-coast only stops the dial; the next tap streams the centered service', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 22,
      ms: 70,
    });
    await sleep(500);
    const link = dial.locator('[data-dsp-provider]');
    await page.evaluate(() => {
      document.addEventListener('click', e => e.preventDefault(), true);
    });
    await link.tap();
    const index = await settled(() => streamIndex(dial), 600);
    // iOS rule: touching a moving scroll view stops it without activating.
    await expect(page.getByTestId('dial-activated')).toHaveText('');
    const id = `dest-${String(index + 1).padStart(3, '0')}`;
    await expect(page.getByTestId('dial-selected')).toHaveText(id);
    await link.tap();
    await expect(page.getByTestId('dial-activated')).toHaveText(id);
  });
});

test.describe('dsp dial: haptics and feedback', () => {
  test('ticks the selection haptic once per item crossed', async ({ page }) => {
    const dial = await open(page, 'tim');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 190 - ROW_STEP_PX * 2,
      ms: 700,
      restMs: 140,
    });
    await settled(() => page.getByTestId('dial-selected').innerText());
    const vibrations = await page.evaluate(
      () => (window as unknown as { __vibrations: unknown[] }).__vibrations
    );
    expect(vibrations.length).toBeGreaterThanOrEqual(2);
    expect(vibrations.every(v => JSON.stringify(v) === '[5]')).toBe(true);
  });
});

test.describe('dsp dial: keyboard and semantics', () => {
  test('is a labelled listbox with a live announcement of the selection', async ({
    page,
  }) => {
    const dial = await open(page, 'tim');
    const listbox = dial.getByRole('listbox', {
      name: 'Choose a streaming service',
    });
    await expect(listbox).toBeVisible();
    const selected = listbox.getByRole('option', { selected: true });
    await expect(selected).toHaveAttribute('aria-posinset', '1');
    await expect(selected).toHaveAttribute('aria-setsize', '3');
    await expect(dial.getByRole('status')).toHaveText('Spotify selected');
    await listbox.focus();
    await page.keyboard.press('ArrowDown');
    await expect(dial.getByRole('status')).toHaveText('Apple Music selected');
  });

  test('arrows, Home, End and paging move through 100 items', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const listbox = dial.getByRole('listbox');
    const selected = page.getByTestId('dial-selected');
    await listbox.focus();
    await page.keyboard.press('ArrowDown');
    await expect(selected).toHaveText('dest-002');
    await page.keyboard.press('ArrowDown');
    await expect(selected).toHaveText('dest-003');
    await page.keyboard.press('ArrowUp');
    await expect(selected).toHaveText('dest-002');
    await page.keyboard.press('End');
    await expect(selected).toHaveText('dest-100');
    await page.keyboard.press('ArrowDown');
    await expect(selected).toHaveText('dest-100');
    await page.keyboard.press('Home');
    await expect(selected).toHaveText('dest-001');
    await page.keyboard.press('PageDown');
    await expect(selected).toHaveText('dest-006');
    await page.keyboard.press('PageUp');
    await expect(selected).toHaveText('dest-001');
  });

  test('shows a visible focus ring and keeps every target at least 44px', async ({
    page,
  }) => {
    const dial = await open(page, 'tim');
    const listbox = dial.getByRole('listbox');
    await page.keyboard.press('Tab');
    await expect(listbox).toBeFocused();
    const outline = await listbox.evaluate(el => {
      const style = getComputedStyle(el);
      return `${style.outlineStyle}|${style.boxShadow}`;
    });
    expect(outline).not.toBe('none|none');
    for (const label of ['Apple Music', 'Spotify']) {
      const row = dial.getByRole('option', { name: label });
      const box = await row.boundingBox();
      if (box && box.height > 0) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const action = await dial.locator('[data-dsp-provider]').boundingBox();
    expect(action?.height).toBeGreaterThanOrEqual(44);
  });

  test('Tab moves from the listbox to Stream Now', async ({ page }) => {
    const dial = await open(page, 'tim');
    await page.keyboard.press('Tab');
    await expect(dial.getByRole('listbox')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dial.locator('[data-dsp-provider]')).toBeFocused();
  });
});

test.describe('dsp dial: first-use hint', () => {
  const hint = (page: Page) => page.getByTestId('action-dial-hint');

  test('shows on first visit, hides after a swipe, stays hidden on reload', async ({
    page,
  }) => {
    const dial = await open(page, 'tim');
    await expect(hint(page)).toHaveAttribute('data-visible', 'true');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 170,
      toY: box.y + 170 - ROW_STEP_PX,
      ms: 400,
      restMs: 140,
    });
    await expect(hint(page)).toHaveAttribute('data-visible', 'false');
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(400);
    await expect(hint(page)).toHaveAttribute('data-visible', 'false');
    // Screen readers keep the description after the glyph retires.
    await expect(page.getByRole('listbox')).toHaveAccessibleDescription(
      /Swipe to switch/
    );
  });

  test('keyboard use retires it too', async ({ page }) => {
    const dial = await open(page, 'tim');
    await expect(hint(page)).toHaveAttribute('data-visible', 'true');
    await dial.getByRole('listbox').focus();
    await page.keyboard.press('ArrowDown');
    await expect(hint(page)).toHaveAttribute('data-visible', 'false');
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(400);
    await expect(hint(page)).toHaveAttribute('data-visible', 'false');
  });

  test('a mere tap on Stream Now is not use', async ({ page }) => {
    const dial = await open(page, 'tim');
    await page.evaluate(() => {
      document.addEventListener('click', e => e.preventDefault(), true);
    });
    await dial.locator('[data-dsp-provider]').tap();
    await expect(hint(page)).toHaveAttribute('data-visible', 'true');
  });

  test('works with storage blocked and stays calm under reduced motion', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const dial = await open(page, 'tim');
    await expect(hint(page)).toHaveAttribute('data-visible', 'true');
    const animations = await hint(page)
      .locator('span')
      .evaluate(el => el.getAnimations().length);
    expect(animations).toBe(0);
    await dial.getByRole('listbox').focus();
    await page.keyboard.press('ArrowDown');
    await expect(hint(page)).toHaveAttribute('data-visible', 'false');
  });
});

test.describe('dsp dial: reduced motion', () => {
  test('a fling snaps with no coasting frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await drag(cdp, {
      x: box.x + box.width / 2,
      fromY: box.y + 190,
      toY: box.y + 22,
      ms: 70,
    });
    // Snapped, not coasting: at rest within a few frames of the lift.
    await expect(dial).toHaveAttribute('data-state', 'idle', { timeout: 600 });
    const position = Number(await dial.getAttribute('data-position'));
    expect(Number.isInteger(position)).toBe(true);
    expect(position).toBeGreaterThan(3);
  });
});

test.describe('dsp dial: performance', () => {
  test('a fling on 100 items has no long task over 50ms and steady frames', async ({
    page,
  }) => {
    const dial = await open(page, 'synthetic');
    const box = await dialBox(dial);
    const cdp = await openGesture(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __longTasks: number[];
        __frames: number[];
      };
      w.__longTasks.length = 0;
      w.__frames.length = 0;
    });
    for (let i = 0; i < 3; i++) {
      await drag(cdp, {
        x: box.x + box.width / 2,
        fromY: box.y + 190,
        toY: box.y + 22,
        ms: 70,
      });
      await sleep(900);
    }
    await settled(() => streamIndex(dial), 600);
    const { longTasks, frames } = await page.evaluate(() => {
      const w = window as unknown as {
        __longTasks: number[];
        __frames: number[];
      };
      return { longTasks: [...w.__longTasks], frames: [...w.__frames] };
    });
    const worst = Math.max(0, ...longTasks);
    expect(worst, `long tasks: ${longTasks.join(',')}`).toBeLessThanOrEqual(50);
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    expect(p95, `frame p95 ${p95}ms over ${frames.length} frames`).toBeLessThan(
      34
    );
  });
});
