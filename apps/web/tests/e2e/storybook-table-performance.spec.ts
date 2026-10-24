import { expect, test } from '@playwright/test';

// Deterministic render/retention budgets; wall-clock samples are audit evidence,
// not machine-dependent CI thresholds. Run in the existing Storybook lane.
const MAX_WINDOW_ROWS = 31; // 640px / 32px + two 5-row overscan bands + rounding

for (const width of [390, 1280]) {
  for (const theme of ['dark', 'light']) {
    test(`bounds table work during viewport/filter navigation (${width}px ${theme})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const suffix = theme === 'light' ? '-light' : '';
      await page.goto(
        `/iframe.html?id=organisms-table-performance--navigation-stress${suffix}&viewMode=story`
      );
      const table = page.getByRole('table', {
        name: '10,000 people performance fixture',
      });
      const rows = table.locator('tbody tr[data-index]');
      await expect(rows.first()).toBeVisible();
      await expect
        .poll(() => rows.count())
        .toBeLessThanOrEqual(MAX_WINDOW_ROWS);
      const originalTable = await table.elementHandle();
      const client = await page.context().newCDPSession(page);
      const sample = async () => {
        await client.send('HeapProfiler.collectGarbage');
        return {
          ...(await client.send('Memory.getDOMCounters')),
          ...(await client.send('Runtime.getHeapUsage')),
          mountedRows: await rows.count(),
          cellRenders: Number(
            await page
              .getByLabel('Table performance measurements')
              .getAttribute('data-cell-renders')
          ),
        };
      };
      const initial = await sample();
      for (let step = 1; step <= 40; step += 1) {
        await table.evaluate((element, index) => {
          element.parentElement!.scrollTop = index * 32;
        }, step * 100);
        await expect(
          table.locator(`tr[data-index="${step * 100}"]`)
        ).toBeAttached();
        expect(await rows.count()).toBeLessThanOrEqual(MAX_WINDOW_ROWS);
      }
      const scrolled = await sample();
      // Detached row DOM must stay bounded after visiting 1,000+ distinct rows.
      expect(scrolled.nodes - initial.nodes).toBeLessThan(1000);
      const rowHeights = await rows.evaluateAll(elements =>
        elements.map(element => element.getBoundingClientRect().height)
      );
      for (const height of rowHeights) expect(height).toBeCloseTo(32, 0);

      const start = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name: 'Toggle viewport' }).click();
      await expect(rows).toHaveCount(0);
      const hiddenMs = (await page.evaluate(() => performance.now())) - start;
      const hidden = await sample();
      expect(hidden.cellRenders).toBe(scrolled.cellRenders);
      await page.getByRole('button', { name: 'Toggle viewport' }).click();
      await expect(rows.first()).toBeVisible();
      for (let step = 0; step < 10; step += 1) {
        await page.getByRole('button', { name: 'Toggle filter' }).click();
        await expect(rows.first()).toBeVisible();
        expect(await rows.count()).toBeLessThanOrEqual(MAX_WINDOW_ROWS);
        expect(
          await table.evaluate(
            (element, original) => element === original,
            originalTable
          )
        ).toBe(true);
      }
      const filtered = await sample();
      expect(filtered.nodes - initial.nodes).toBeLessThan(1000);
      await testInfo.attach('table-performance.json', {
        body: JSON.stringify(
          { width, theme, initial, scrolled, hidden, filtered, hiddenMs },
          null,
          2
        ),
        contentType: 'application/json',
      });
      await originalTable?.dispose();
    });
  }
}
