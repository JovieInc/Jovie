import { expect, type Page, test } from '@playwright/test';

async function geometry(page: Page) {
  return page
    .locator('[data-testid^="library-catalog-row-"]')
    .evaluateAll(rows => {
      const violations: string[] = [];
      for (const row of rows) {
        const bounds = row.getBoundingClientRect();
        const table = row.closest('table')!;
        const viewport = table.parentElement!.getBoundingClientRect();
        if (Math.abs(bounds.height - 32) > 1)
          violations.push(`row height ${bounds.height}`);
        if (bounds.right > viewport.right + 1)
          violations.push(`row overflow ${bounds.right - viewport.right}`);
        for (const cell of row.querySelectorAll('td')) {
          const box = cell.getBoundingClientRect();
          if (box.right > viewport.right + 1)
            violations.push(`cell overflow ${box.right - viewport.right}`);
        }
        const art = row.querySelector(
          '[data-testid^="library-media-thumbnail-"]'
        );
        if (art) {
          const image = art.getBoundingClientRect();
          const content = art
            .closest('[data-table-cell-content]')!
            .getBoundingClientRect();
          if (Math.abs(image.width - 24) > 1 || Math.abs(image.height - 24) > 1)
            violations.push('art size');
          if (image.top < content.top - 1 || image.bottom > content.bottom + 1)
            violations.push('art clipping');
        }
        const title = row.querySelector('.system-b-library-release-title')!;
        if (title.getBoundingClientRect().width < 160)
          violations.push('title budget');
      }
      return { count: rows.length, violations };
    });
}

for (const story of ['dense-scan-with-inspector', 'virtualized-dense-scan']) {
  test(`dense Library fits with its actual inspector: ${story}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Retain native motion for this interaction check; the ordinary screenshot
    // fixture otherwise forces reduced motion and masks transition regressions.
    await page.addInitScript(() => {
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
    });
    await page.goto(
      `/iframe.html?id=library-workinspector--${story}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );
    const first = page.getByTestId('library-catalog-row-release-proof');
    await expect(first).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('library-asset-drawer')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    await page.screenshot({
      path: testInfo.outputPath(`${story}-mounted.png`),
      fullPage: true,
    });
    await testInfo.attach('initial-geometry', {
      body: JSON.stringify(await geometry(page)),
      contentType: 'application/json',
    });
    await expect
      .poll(async () => (await geometry(page)).violations)
      .toEqual([]);
    expect((await geometry(page)).count).toBeGreaterThan(1);
    await expect(first.getByTestId('table-column-compacts')).toHaveCount(0);
    await expect(
      first.locator('[data-testid^="library-catalog-bpm-"]')
    ).toHaveCount(0);
    const inspectorTitle = page.getByTestId('library-asset-entity-header');
    await expect(inspectorTitle).toContainText(
      'A Deliberately Long Work Title'
    );

    await page.evaluate(() => document.fonts.ready);
    const before = await first.boundingBox();
    await page.getByRole('button', { name: 'Refresh Fixture' }).click();
    await expect(page.getByTestId('library-browser-proof')).toHaveAttribute(
      'data-revision',
      '1'
    );
    const transforms = await page
      .getByTestId('library-surface')
      .locator('table')
      .evaluate(async table => {
        const moved: string[] = [];
        for (let frame = 0; frame < 12; frame++) {
          await new Promise(requestAnimationFrame);
          for (const cell of table.querySelectorAll('td')) {
            if (getComputedStyle(cell).transform !== 'none')
              moved.push('animated cell');
          }
        }
        return moved;
      });
    expect(transforms).toEqual([]);
    const after = await first.boundingBox();
    expect(after).toEqual(before);
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(inspectorTitle).toContainText(
      'A Deliberately Long Work Title'
    );

    // Deliberate-red: the reported defect (36px art in a 24px content budget)
    // must trip the same geometry detector used for the real component.
    const art = first.locator('[data-testid^="library-media-thumbnail-"]');
    await art.evaluate(element => {
      (element as HTMLElement).style.height = '36px';
    });
    expect((await geometry(page)).violations).toContain('art size');
    await art.evaluate(element => element.removeAttribute('style'));
    await expect
      .poll(async () => (await geometry(page)).violations)
      .toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${story}.png`),
      fullPage: true,
    });
  });
}

test('loading reserves the same dense row and title geometry', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    '/iframe.html?id=library-workinspector--dense-loading&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const loading = page.getByTestId('library-surface-loading');
  await expect(loading).toBeVisible({ timeout: 90_000 });
  await page.screenshot({
    path: testInfo.outputPath('dense-loading-mounted.png'),
    fullPage: true,
  });
  await expect.poll(async () => loading.locator('thead th').count()).toBe(5);
  const layout = await loading.locator('table').evaluate(table => {
    const headers = [...table.querySelectorAll('thead th')].map(header =>
      header.getBoundingClientRect()
    );
    return [...table.querySelectorAll('tbody tr')].map(row => ({
      height: row.getBoundingClientRect().height,
      cells: [...row.querySelectorAll('td')].map((cell, index) => ({
        leftDelta: cell.getBoundingClientRect().left - headers[index]?.left,
        rightDelta: cell.getBoundingClientRect().right - headers[index]?.right,
      })),
    }));
  });
  expect(layout.length).toBeGreaterThan(0);
  for (const row of layout) {
    expect(Math.abs(row.height - 32)).toBeLessThanOrEqual(1);
    expect(row.cells).toHaveLength(5);
    for (const cell of row.cells) {
      expect(Math.abs(cell.leftDelta)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.rightDelta)).toBeLessThanOrEqual(1);
    }
  }
  await page.screenshot({
    path: testInfo.outputPath('dense-loading.png'),
    fullPage: true,
  });
});

test('Library grid preserves container-fit densities and the phone breakpoint', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    '/iframe.html?id=library-workinspector--dense-scan-with-inspector&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.getByTestId('library-asset-drawer')).toHaveAttribute(
    'aria-hidden',
    'false',
    { timeout: 90_000 }
  );
  await page.getByRole('radio', { name: 'Grid View', exact: true }).check();
  const grid = page.locator('[data-library-grid]');
  const cards = grid.locator('article.system-b-library-card');
  await expect(cards).toHaveCount(19);
  for (const [label, columns] of [
    ['Small cards card size', 3],
    ['Medium cards card size', 2],
    ['Large cards card size', 1],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect
      .poll(() =>
        grid.evaluate(
          element =>
            getComputedStyle(element).gridTemplateColumns.split(' ').length
        )
      )
      .toBe(columns);
    const gridRight = await grid.evaluate(
      element => element.getBoundingClientRect().right
    );
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(gridRight + 1);
    }
    expect(
      await cards
        .first()
        .evaluate(
          element =>
            getComputedStyle(element).gridTemplateRows.split(' ').length
        )
    ).toBe(2);
    await page.screenshot({
      path: testInfo.outputPath(`grid-${columns}-columns.png`),
      fullPage: true,
    });
  }
  // Verify the grid breakpoint itself. This fixed-width inspector fixture is
  // intentionally not a full mobile-page certification.
  await page.setViewportSize({ width: 639, height: 900 });
  await expect
    .poll(() =>
      grid.evaluate(
        element =>
          getComputedStyle(element).gridTemplateColumns.split(' ').length
      )
    )
    .toBe(2);
  await expect(page.getByTestId('library-grid-density-toggle')).toBeHidden();
});
test('Library grid reviews from the tile reached by Tab', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    '/iframe.html?id=library-workinspector--dense-scan-with-inspector&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.getByTestId('library-asset-drawer')).toHaveAttribute(
    'aria-hidden',
    'false',
    { timeout: 90_000 }
  );
  await page.getByRole('radio', { name: 'Grid View', exact: true }).check();
  const cards = page.locator(
    '[data-library-grid] article.system-b-library-card'
  );
  const first = cards.nth(0).locator('[data-library-item-focus]');
  const second = cards.nth(1).locator('[data-library-item-focus]');
  const third = cards.nth(2).locator('[data-library-item-focus]');
  await first.focus();
  for (
    let tab = 0;
    tab < 4 &&
    !(await second.evaluate(node => node === document.activeElement));
    tab++
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(second).toBeFocused();
  await expect(cards.first()).toHaveClass(/system-b-library-card--selected/);
  await page.keyboard.press('ArrowRight');
  await expect(third).toBeFocused();
  await expect(cards.nth(2)).toHaveClass(/system-b-library-card--selected/);
  await page.screenshot({
    path: testInfo.outputPath('grid-tab-focus.png'),
    fullPage: true,
  });
});
