import { writeFile } from 'node:fs/promises';
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
