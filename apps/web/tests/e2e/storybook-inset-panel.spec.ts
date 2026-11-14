import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const SLOTS = [
  'inset-panel-meta',
  'inset-panel-header-trailing',
  'inset-panel-trailing',
] as const;
const EVIDENCE_DIR = join('test-results', 'storybook-inset-panel-evidence');

for (const theme of ['light', 'dark'] as const) {
  test(`InsetPanel preserves zero counts and empty-slot geometry [${theme}]`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => {
      errors.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText}`
      );
    });
    page.on('response', response => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(
      '/iframe.html?id=ui-atoms-insetpanel--count-slots&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    await expect(page.locator('html')).toHaveClass(
      new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`)
    );
    const root = page.locator('#storybook-root');
    for (const [label, value] of [
      ['Zero', '0'],
      ['Nonzero', '7'],
    ] as const) {
      const panel = root.getByRole('region', {
        name: `${label} count`,
        exact: true,
      });
      await expect(panel).toBeVisible();
      for (const slot of SLOTS) {
        const count = panel.locator(`[data-slot="${slot}"]`);
        await expect(count).toBeVisible();
        await expect(count).toHaveText(value);
      }
    }
    for (const label of ['Null', 'Undefined', 'False', 'Empty']) {
      const panel = root.getByRole('region', {
        name: `${label} count`,
        exact: true,
      });
      await expect(panel).toBeVisible();
      for (const slot of SLOTS)
        await expect(panel.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
      await expect(panel).toHaveText(`${label} countPending changes`);
    }

    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const geometry = await root.evaluate(node => {
      const box = (element: Element) => {
        const { x, y, width, height, right, bottom } =
          element.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      };
      return Array.from(node.querySelectorAll('[data-slot="inset-panel"]')).map(
        panel => {
          const header = panel.querySelector(
            '[data-slot="inset-panel-header"]'
          );
          const row = panel.querySelector('[data-slot="inset-panel-row"]');
          if (!header || !row) throw new Error('missing panel header/row');
          return {
            name: panel.getAttribute('aria-label'),
            panel: box(panel),
            header: box(header),
            row: box(row),
            headerEndInset: getComputedStyle(header).paddingInlineEnd,
            slots: Array.from(
              panel.querySelectorAll(
                '[data-slot$="meta"], [data-slot$="trailing"]'
              )
            ).map(slot => ({
              slot: slot.getAttribute('data-slot'),
              box: box(slot),
              color: getComputedStyle(slot).color,
              fontSize: getComputedStyle(slot).fontSize,
            })),
          };
        }
      );
    });
    expect(geometry).toHaveLength(6);
    const zero = geometry.find(panel => panel.name === 'Zero count');
    const nonzero = geometry.find(panel => panel.name === 'Nonzero count');
    expect(zero).toBeDefined();
    expect(nonzero).toBeDefined();
    expect(zero?.headerEndInset).toBe(nonzero?.headerEndInset);
    expect(
      zero?.slots
        .filter(slot => slot.slot !== 'inset-panel-meta')
        .map(slot => slot.box.right)
    ).toEqual(
      nonzero?.slots
        .filter(slot => slot.slot !== 'inset-panel-meta')
        .map(slot => slot.box.right)
    );
    for (const panel of geometry) {
      expect(panel.header.height).toBe(32);
      expect(panel.row.height).toBe(32);
      expect(panel.panel.width).toBeLessThanOrEqual(390);
      for (const part of [
        panel.header,
        panel.row,
        ...panel.slots.map(slot => slot.box),
      ]) {
        expect(part.width).toBeGreaterThan(0);
        expect(part.height).toBeGreaterThan(0);
        expect(part.x).toBeGreaterThanOrEqual(panel.panel.x);
        expect(part.right).toBeLessThanOrEqual(panel.panel.right);
        expect(part.y).toBeGreaterThanOrEqual(panel.panel.y);
        expect(part.bottom).toBeLessThanOrEqual(panel.panel.bottom);
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    const axe = await new AxeBuilder({ page })
      .include('#storybook-root')
      .options(wcag22AaAxeOptions())
      .analyze();
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const image = await root.screenshot({ animations: 'disabled' });
    const evidence = JSON.stringify({ theme, geometry, errors, axe }, null, 2);
    await writeFile(join(EVIDENCE_DIR, `counts-${theme}.json`), evidence);
    await writeFile(join(EVIDENCE_DIR, `counts-${theme}.png`), image);
    await testInfo.attach(`counts-${theme}.json`, {
      body: evidence,
      contentType: 'application/json',
    });
    await testInfo.attach(`counts-${theme}.png`, {
      body: image,
      contentType: 'image/png',
    });
    expect(errors).toEqual([]);
    expect(axe.violations).toEqual([]);
    expect(axe.incomplete.filter(rule => rule.id === 'color-contrast')).toEqual(
      []
    );
  });
}
