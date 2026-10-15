import { expect, test } from '@playwright/test';

test.describe('pill-state-continuity painted browser contract', () => {
  for (const theme of ['dark', 'light']) {
    test(`preserves slot, center, focus and reversible feedback [${theme}]`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(
        value => localStorage.setItem('jovie-theme-storybook', value),
        theme
      );
      await page.goto(
        '/iframe.html?id=shadcn-button--pill-state-choreography&viewMode=story'
      );
      const buttons = page.locator('[data-pending-presentation=morph]');
      await expect(buttons).toHaveCount(2);
      // Storybook freezes screenshots globally. Remove that fixture-only style
      // so this proof samples actual production token transitions, not snapshots.
      await page
        .locator('style[data-jovie-storybook-fixtures]')
        .evaluateAll(nodes => nodes.forEach(node => node.remove()));
      await page.evaluate(() => document.fonts.ready);
      const button = buttons.first();
      const sibling = page.getByTestId('morph-sibling');
      const slot = await button.boundingBox();
      const neighbor = await sibling.boundingBox();
      expect(slot?.height).toBeGreaterThanOrEqual(44);
      expect(slot?.width).toBeGreaterThanOrEqual(44);

      await page.evaluate(() => {
        const start = performance.now();
        const state = {
          samples: [] as Array<{
            x: number;
            width: number;
            center: number;
            span: number;
            label: number;
          }>,
          shifts: 0,
          stop: false,
        };
        Object.assign(window, { morphProof: state });
        new PerformanceObserver(list => {
          state.shifts += list
            .getEntries()
            .reduce(
              (sum, entry) =>
                sum +
                (entry.startTime < start
                  ? 0
                  : (entry as PerformanceEntry & { value: number }).value),
              0
            );
        }).observe({ type: 'layout-shift', buffered: true });
        const sample = () => {
          const root = document.querySelector(
            '[data-pending-presentation=morph]'
          )!;
          const box = root.getBoundingClientRect();
          const left = root
            .querySelector('[data-part=morph-surface]')!
            .getBoundingClientRect();
          const right = root
            .querySelector('[data-part=morph-cap]')!
            .getBoundingClientRect();
          state.samples.push({
            x: box.x,
            width: box.width,
            center: (left.x + right.right) / 2,
            span: right.right - left.x,
            label: Number(
              getComputedStyle(root.querySelector('[data-part=morph-label]')!)
                .opacity
            ),
          });
          if (!state.stop) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await button.click();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toBeFocused();
      await expect(button.locator('[data-part=morph-spinner]')).toHaveCSS(
        'opacity',
        '1'
      );
      await expect
        .poll(async () => {
          const l = await button
            .locator('[data-part=morph-surface]')
            .boundingBox();
          const r = await button.locator('[data-part=morph-cap]').boundingBox();
          return Math.round((r?.x ?? 0) - (l?.x ?? 0));
        })
        .toBe(0);
      const circle = await button
        .locator('[data-part=morph-surface]')
        .boundingBox();
      expect(circle?.width).toBeCloseTo(28, 2);
      expect(circle?.height).toBeCloseTo(28, 2);
      expect(await button.boundingBox()).toEqual(slot);
      expect(await sibling.boundingBox()).toEqual(neighbor);
      await testInfo.attach(`pending-${theme}`, {
        body: await page.screenshot({
          path: testInfo.outputPath(`pending-${theme}.png`),
        }),
        contentType: 'image/png',
      });
      await page.getByRole('button', { name: 'Resolve request' }).click();
      await expect(button).toHaveAttribute('data-state', 'success');
      await expect(button.locator('[data-part=morph-check]')).toHaveCSS(
        'opacity',
        '1'
      );
      await expect(
        button.locator('[data-part=morph-surface]')
      ).toHaveJSProperty('offsetWidth', 28);
      await page.getByRole('button', { name: 'Reject request' }).click();
      await expect(button).toHaveAccessibleName('Could not complete. Retry');
      await expect(button.locator('[data-part=morph-label]')).toHaveCSS(
        'opacity',
        '1'
      );
      await button.focus();
      await button.press('Enter');
      await expect(button).toHaveAttribute('data-state', 'pending');
      await expect(button).toHaveAttribute('data-keyboard', 'true');
      await expect(button.locator('[data-part=morph-surface]')).toHaveCSS(
        'transition-property',
        'none'
      );
      await expect(button).toBeFocused();
      const proof = await page.evaluate(() => {
        const state = (
          window as Window & {
            morphProof?: {
              stop: boolean;
              shifts: number;
              samples: Array<{
                x: number;
                width: number;
                center: number;
                span: number;
                label: number;
              }>;
            };
          }
        ).morphProof!;
        state.stop = true;
        return state;
      });
      expect(proof.shifts).toBe(0);
      expect(
        proof.samples.some(s => s.span > 29 && s.span < (slot?.width ?? 0) - 3)
      ).toBe(true);
      expect(proof.samples.some(s => s.label > 0 && s.label < 1)).toBe(true);
      for (const sample of proof.samples) {
        expect(sample.x).toBeCloseTo(slot!.x, 1);
        expect(sample.width).toBeCloseTo(slot!.width, 1);
        expect(sample.center).toBeCloseTo(slot!.x + slot!.width / 2, 1);
      }
      await testInfo.attach('painted-state-samples', {
        body: JSON.stringify(proof),
        contentType: 'application/json',
      });
    });
  }

  test('reduced motion, RTL, 200% scale and full-width rapid reversals', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      '/iframe.html?id=shadcn-button--pill-state-choreography&viewMode=story'
    );
    const buttons = page.locator('[data-pending-presentation=morph]');
    await expect(buttons).toHaveCount(2);
    await page
      .locator('style[data-jovie-storybook-fixtures]')
      .evaluateAll(nodes => nodes.forEach(node => node.remove()));
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
      document.documentElement.style.zoom = '2';
    });
    const button = buttons.last();
    const before = await button.boundingBox();
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button.locator('[data-part=morph-surface]')).toHaveCSS(
      'transition-duration',
      '0s'
    );
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Reject request' }).click();
      await expect(button).toHaveAccessibleName('Could not complete. Retry');
      await button.click();
      await page.getByRole('button', { name: 'Resolve request' }).click();
      await expect(button).toHaveAttribute('data-state', 'success');
    }
    expect(await button.boundingBox()).toEqual(before);
    const circle = await button
      .locator('[data-part=morph-surface]')
      .boundingBox();
    expect(circle?.width).toBeCloseTo(56, 1);
    expect(circle?.height).toBeCloseTo(56, 1);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  });
});
