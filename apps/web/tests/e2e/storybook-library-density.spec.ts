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
