import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const CASES = [
  { story: 'ui-atoms-badge--permission-restricted', state: 'permission' },
  { story: 'ui-atoms-badge--tones', state: 'tones' },
  { story: 'ui-atoms-card--inline-offline', state: 'offline' },
  { story: 'ui-atoms-card--partial-data', state: 'partial' },
  { story: 'shadcn-inlineoffline--default', state: 'retry' },
  { story: 'shadcn-inlineoffline--without-retry', state: 'offline' },
] as const;

type CopyState = (typeof CASES)[number]['state'];

function repairedCopy(root: Locator, state: CopyState) {
  if (state === 'permission') {
    return [
      {
        name: 'permission badge',
        target: root.locator('[data-state="permission-restricted"]'),
      },
    ];
  }
  if (state === 'tones') {
    return [
      { name: 'info badge', target: root.locator('[data-tone="info"]') },
      { name: 'accent badge', target: root.locator('[data-tone="accent"]') },
    ];
  }
  if (state === 'partial') {
    return [
      {
        name: 'partial description',
        target: root.getByText(
          'Showing cached metrics while fresh data loads.',
          { exact: true }
        ),
      },
    ];
  }
  return [
    { name: 'offline message', target: root.getByRole('status').locator('p') },
  ];
}

async function assertState(
  root: Locator,
  state: (typeof CASES)[number]['state']
) {
  if (state === 'permission') {
    await expect(
      root.locator('[data-state="permission-restricted"]')
    ).toHaveText('Admin only');
  } else if (state === 'tones') {
    await expect(root.locator('[data-tone="info"]')).toHaveText('info');
    await expect(root.locator('[data-tone="accent"]')).toHaveText('accent');
  } else if (state === 'partial') {
    const card = root.locator('[data-content-state="partial"]');
    await expect(card).toHaveAttribute('aria-busy', 'true');
    await expect(card).toHaveCSS('opacity', '0.8');
    await expect(card).toContainText(
      'Showing cached metrics while fresh data loads.'
    );
    await expect(card).toContainText('12.4K profile views');
  } else {
    const status = root.getByRole('status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveAttribute('aria-atomic', 'true');
    await expect(status).toContainText(/offline/i);
    if (state === 'retry') {
      await expect(status.getByRole('button', { name: 'Retry' })).toBeEnabled();
    }
  }
}

test.describe('Canonical status copy contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { story, state } of CASES) {
      test(`${story} retains readable status copy [${theme}]`, async ({
        page,
      }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await page.addInitScript(value => {
          localStorage.setItem('jovie-theme-storybook', value);
        }, theme);
        await page.goto(`/iframe.html?id=${story}&viewMode=story`, {
          waitUntil: 'domcontentloaded',
        });
        const root = page.locator('#storybook-root');
        await expect(root).toBeVisible();
        await assertState(root, state);
        await expect(page.locator('html')).toHaveClass(
          new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`)
        );
        const targets = repairedCopy(root, state);
        for (const { target } of targets) await expect(target).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const result = await new AxeBuilder({ page })
          .include('#storybook-root')
          .options(wcag22AaAxeOptions())
          .analyze();
        const contrast = {
          passing: result.passes.filter(rule => rule.id === 'color-contrast'),
          incomplete: result.incomplete.filter(
            rule => rule.id === 'color-contrast'
          ),
        };
        const nodes = contrast.passing
          .flatMap(rule => rule.nodes)
          .map(node => ({
            selectors: node.target.flatMap(target =>
              typeof target === 'string' ? [target] : []
            ),
            ratios: node.any
              .filter(check => check.id === 'color-contrast')
              .flatMap(check => {
                const ratio = check.data?.contrastRatio;
                return typeof ratio === 'number' ? [ratio] : [];
              }),
          }));
        const measured = [];
        for (const { name, target } of targets) {
          const ratios = await target.evaluate(
            (element, candidates) =>
              candidates.flatMap(node => {
                const matches = node.selectors.some(selector => {
                  try {
                    return (
                      element.ownerDocument.querySelector(selector) === element
                    );
                  } catch {
                    return false;
                  }
                });
                return matches ? node.ratios : [];
              }),
            nodes
          );
          measured.push({ name, ratios });
        }
        const axePath = testInfo.outputPath(`${story}-${theme}-axe.json`);
        await writeFile(
          axePath,
          JSON.stringify(
            {
              violations: result.violations,
              contrast,
              measured,
            },
            null,
            2
          )
        );
        await testInfo.attach(`${story}-${theme}-axe.json`, {
          path: axePath,
          contentType: 'application/json',
        });
        const imagePath = testInfo.outputPath(`${story}-${theme}.png`);
        await root.screenshot({ path: imagePath, animations: 'disabled' });
        await testInfo.attach(`${story}-${theme}.png`, {
          path: imagePath,
          contentType: 'image/png',
        });
        expect(errors).toEqual([]);
        expect(result.violations).toEqual([]);
        expect(contrast.incomplete).toEqual([]);
        for (const { name, ratios } of measured) {
          expect(
            ratios,
            `${name} must have an actual axe contrast measurement`
          ).not.toEqual([]);
          for (const ratio of ratios)
            expect(ratio, name).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

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
