import { expect, type Page, test } from '@playwright/test';

type Frame = { movingCells: number; railPhase: string | null };
type MotionWindow = Window & { tableMotionFrames: Promise<Frame[]> };

async function liveMotion(page: Page) {
  await page.addInitScript(() => {
    // Match the existing rail-motion harness: preserve native media queries
    // and remove only Storybook's snapshot freeze, never product CSS.
    Object.defineProperty(window, 'matchMedia', {
      value: window.matchMedia.bind(window),
      configurable: false,
      writable: false,
    });
    new MutationObserver(() => {
      document
        .querySelectorAll('style[data-jovie-storybook-fixtures]')
        .forEach(node => node.remove());
    }).observe(document, { childList: true, subtree: true });
    (window as Window & { __jovieApiMock: () => Response }).__jovieApiMock =
      () => Response.json({ success: true, suggestions: [], links: [] });
  });
}

async function observeProjection(page: Page, action: () => Promise<unknown>) {
  await page.evaluate(() => {
    (window as MotionWindow).tableMotionFrames = new Promise(resolve => {
      const frames: Frame[] = [];
      const sample = () => {
        const cells = [
          ...document.querySelectorAll('tr[data-index] > td, thead th'),
        ];
        frames.push({
          movingCells: cells.filter(cell => {
            const bounds = cell.getBoundingClientRect();
            const transform = getComputedStyle(cell).transform;
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              transform !== 'none' &&
              !new DOMMatrixReadOnly(transform).isIdentity
            );
          }).length,
          railPhase:
            document
              .querySelector('[data-rail-phase]')
              ?.getAttribute('data-rail-phase') ?? null,
        });
        if (frames.length < 60) requestAnimationFrame(sample);
        else resolve(frames);
      };
      requestAnimationFrame(sample);
    });
  });
  await action();
  return page.evaluate(() => (window as MotionWindow).tableMotionFrames);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await liveMotion(page);
});

test('Presence row selection does not project table cells into the inspector', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(
    '/iframe.html?id=presence-savedlinkremoval--confirmation&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const rows = page.locator('tbody tr[data-index]');
  await expect(rows).toHaveCount(2, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(rows.last()).toBeVisible();
  const frames = await observeProjection(page, () => rows.last().click());
  await expect(rows.last()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('app-shell-right-rail')).toBeVisible();
  await info.attach('presence-drawer-motion.json', {
    body: JSON.stringify(frames),
    contentType: 'application/json',
  });
  expect(frames.filter(frame => frame.movingCells > 0)).toEqual([]);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Releases drawer open, switch, close and rapid reversal stay quiet (${reducedMotion})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto(
      '/iframe.html?id=organisms-table-motioncauses--release-drawer&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const rows = page.locator('tbody tr[data-index]');
    // ReleaseTable virtualizes the 24-item fixture inside its bounded scroller.
    await expect(rows.nth(1)).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    const traces: Frame[][] = [];
    traces.push(await observeProjection(page, () => rows.first().click()));
    await expect(page.getByLabel('Selected row', { exact: true })).toHaveText(
      'release-0'
    );
    traces.push(
      await observeProjection(page, () => rows.nth(1).press('Enter'))
    );
    await expect(page.getByLabel('Selected row', { exact: true })).toHaveText(
      'release-1'
    );
    traces.push(
      await observeProjection(page, () =>
        page
          .getByRole('button', { name: 'Close inspector', exact: true })
          .click()
      )
    );
    await expect(page.getByLabel('Selected row', { exact: true })).toHaveText(
      'None'
    );
    const toggle = page.getByRole('button', {
      name: 'Toggle inspector',
      exact: true,
    });
    await toggle.focus();
    for (let cycle = 0; cycle < 10; cycle++) {
      traces.push(
        await observeProjection(page, async () => {
          await toggle.press('Enter');
          await toggle.press('Enter');
        })
      );
      await expect(toggle).toBeFocused();
      await expect(page.getByLabel('Selected row', { exact: true })).toHaveText(
        'None'
      );
    }
    await info.attach('release-drawer-motion.json', {
      body: JSON.stringify(traces),
      contentType: 'application/json',
    });
    expect(traces.flat().filter(frame => frame.movingCells > 0)).toEqual([]);
  });

  test(`explicit column resizing retains its motion policy (${reducedMotion})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto(
      '/iframe.html?id=organisms-table-motioncauses--column-resize&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const cell = page.locator('tr[data-index]').first().locator('td').first();
    await expect(cell).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    const before = await cell.boundingBox();
    await expect(
      page.getByRole('columnheader', { name: /^Status/ })
    ).toBeVisible();
    const resize = page.getByRole('button', {
      name: 'Resize column',
      exact: true,
    });
    const frames = await observeProjection(page, () => resize.click());
    const after = await cell.boundingBox();
    expect(after?.width).toBeGreaterThan(before?.width ?? 0);
    await expect(resize).toBeFocused();
    await info.attach('column-resize-motion.json', {
      body: JSON.stringify(frames),
      contentType: 'application/json',
    });
    if (reducedMotion === 'reduce')
      expect(frames.filter(frame => frame.movingCells > 0)).toEqual([]);
    else expect(frames.some(frame => frame.movingCells > 0)).toBe(true);
    await observeProjection(page, () => resize.click());
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('columnheader', { name: /^Status/ })
    ).toHaveCount(0);
    await expect(cell).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
      page.getByRole('columnheader', { name: /^Status/ })
    ).toBeVisible();
    await expect(resize).toBeFocused();
  });
}

test('a narrow Presence inspector preserves the scrolled table and keyboard dismissal', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(
    '/iframe.html?id=organisms-table-motioncauses--presence-drawer&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const rows = page.locator('tbody tr[data-index]');
  await expect(rows).toHaveCount(24, { timeout: 90_000 });
  const scroller = page.locator('table:has(tr[data-index])').locator('..');
  const before = await scroller.evaluate(node => {
    node.scrollTop = 200;
    node.scrollLeft = 100;
    return { top: node.scrollTop, left: node.scrollLeft };
  });
  expect(before.top).toBeGreaterThan(0);
  const opening = await observeProjection(page, () => rows.nth(8).click());
  await expect(
    page.getByRole('dialog', { name: 'Selected row details' })
  ).toBeVisible();
  await info.attach('narrow-inspector.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const closing = await observeProjection(page, () =>
    page.keyboard.press('Escape')
  );
  await expect(page.getByLabel('Selected row', { exact: true })).toHaveText(
    'None'
  );
  expect(
    await scroller.evaluate(node => ({
      top: node.scrollTop,
      left: node.scrollLeft,
    }))
  ).toEqual(before);
  expect(
    [...opening, ...closing].filter(frame => frame.movingCells > 0)
  ).toEqual([]);
  await expect(rows.nth(8)).toBeFocused();
});
