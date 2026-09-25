import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const THEME_KEY = 'jovie-theme-storybook';

test.describe('Kbd Storybook browser proof', () => {
  // Full-catalog Storybook compilation can take over two minutes on a cold runner.
  test.describe.configure({ retries: 0, timeout: 240_000 });
  for (const theme of ['light', 'dark'] as const) {
    test(`renders mobile shortcut variants without overflow [${theme}]`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: THEME_KEY, value: theme }
      );

      for (const [story, labels, variant] of [
        ['default', ['⌘K'], 'default'],
        ['tooltip-variant', ['Esc'], 'tooltip'],
        ['shortcut-sequence', ['⌘', '⇧', 'P'], 'default'],
      ] as const) {
        await page.goto(
          `/iframe.html?id=ui-atoms-kbd--${story}&viewMode=story`,
          {
            waitUntil: 'commit',
          }
        );
        const keys = page.locator('#storybook-root kbd[data-slot="kbd"]');
        await expect(keys).toHaveCount(labels.length, { timeout: 180_000 });
        for (const [index, label] of labels.entries()) {
          await expect(keys.nth(index)).toHaveText(label);
          await expect(keys.nth(index)).toHaveAttribute(
            'data-variant',
            variant
          );
        }
        await expect(page.locator('html')).toHaveClass(
          new RegExp(`\\b${theme}\\b`)
        );
        const geometry = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      }

      const screenshot = await page.screenshot({ animations: 'disabled' });
      const evidenceDir = join('test-results', 'storybook-selected-evidence');
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(join(evidenceDir, `kbd-${theme}.png`), screenshot);
      await testInfo.attach(`kbd-${theme}.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
    });
  }
});
