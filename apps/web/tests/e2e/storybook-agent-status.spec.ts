import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const EVIDENCE = join('test-results', 'agent-status-evidence');
const MATRIX = 'ui-atoms-statusglyph--operation-states';
const CHAT = 'jovie-components-toolpartsrenderer--receipt-lifecycle';

async function open(page: Page, story: string) {
  await page.goto(`/iframe.html?id=${story}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.locator('#storybook-root [data-status-glyph]')
  ).not.toHaveCount(0, { timeout: 180_000 });
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test(`operation states and stable chat completion ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(
        value => localStorage.setItem('jovie-theme-storybook', value),
        theme
      );
      await open(page, MATRIX);
      const glyphs = page.locator('#storybook-root [data-status-glyph]');
      await expect(glyphs).toHaveCount(7);
      await expect(
        page.locator('#storybook-root [data-fill="check"]')
      ).toHaveCount(1);
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${theme}\\b`)
      );
      const audit = await new AxeBuilder({ page })
        .include('#storybook-root')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(audit.violations).toEqual([]);
      await mkdir(EVIDENCE, { recursive: true });
      const matrixCapture = await page.screenshot({ animations: 'disabled' });
      await writeFile(
        join(EVIDENCE, `states-${theme}-${width}.png`),
        matrixCapture
      );
      await info.attach('seven-operation-states.png', {
        body: matrixCapture,
        contentType: 'image/png',
      });
      await open(page, CHAT);
      // Verbose diagnostics are explicit disclosure and excluded from async geometry.
      const row = page.getByTestId('tool-status-row');
      const sentinel = page.getByTestId('status-layout-sentinel');
      const before = {
        row: await row.boundingBox(),
        sentinel: await sentinel.boundingBox(),
      };
      const owner = await row.elementHandle();
      for (const [event, expected, count] of [
        ['unconfirmed', 'pending', 0],
        ['Interrupt', 'unknown', 0],
        ['succeeded', 'succeeded', 1],
        ['failed', 'failed', 0],
        ['cancelled', 'cancelled', 0],
        ['pending', 'pending', 0],
        ['working', 'working', 0],
      ] as const) {
        const button = page.getByRole('button', { name: event, exact: true });
        await button.focus();
        await button.press('Enter');
        await expect(button).toBeFocused();
        await expect(row).toHaveAttribute('data-operation-status', expected);
        await expect(row.locator('[data-fill="check"]')).toHaveCount(count);
        await expect(row.getByRole('img')).toHaveCount(0);
        expect(
          await row.evaluate((element, previous) => element === previous, owner)
        ).toBe(true);
        expect(await row.boundingBox()).toEqual(before.row);
        expect(await sentinel.boundingBox()).toEqual(before.sentinel);
      }
      // Status text must not introduce horizontal overflow on compact screens.
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true);
      await page
        .getByRole('button', { name: 'succeeded', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByRole('alert')).toHaveCount(0);
      const capture = await page.screenshot({ animations: 'disabled' });
      await writeFile(join(EVIDENCE, `chat-${theme}-${width}.png`), capture);
      await info.attach('persisted-success.png', {
        body: capture,
        contentType: 'image/png',
      });
    });
  }
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`working ring obeys visibility and motion preference ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await open(page, MATRIX);
    // The catalog freezes every animation for deterministic snapshots. Remove only
    // that test fixture to measure the production CSS under the real media query.
    await page
      .locator('style[data-jovie-storybook-fixtures]')
      .evaluateAll(styles => styles.forEach(style => style.remove()));
    const working = page.locator(
      '#storybook-root [data-status-glyph="working"] svg'
    );
    await expect(working).toHaveClass(/motion-safe:animate-spin/);
    await expect
      .poll(() =>
        working.evaluate(element => getComputedStyle(element).animationName)
      )
      .toBe(reducedMotion === 'reduce' ? 'none' : 'spin');
    const statusOwner = page.locator(
      '#storybook-root [data-status-glyph="working"]'
    );
    const box = await statusOwner.boundingBox();
    await page.locator('#storybook-root').evaluate(element => {
      element.style.marginTop = '200vh';
    });
    await expect(working).not.toHaveClass(/motion-safe:animate-spin/);
    await page.locator('#storybook-root').evaluate(element => {
      element.style.marginTop = '';
    });
    await expect(working).toHaveClass(/motion-safe:animate-spin/);
    expect(await statusOwner.boundingBox()).toEqual(box);
    for (const state of [
      'idle',
      'pending',
      'succeeded',
      'failed',
      'cancelled',
      'unknown',
    ]) {
      expect(
        await page
          .locator(`[data-status-glyph="${state}"] svg`)
          .evaluate(element => getComputedStyle(element).animationName)
      ).toBe('none');
    }
  });
}
