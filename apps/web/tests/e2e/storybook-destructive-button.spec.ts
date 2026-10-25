import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

async function attachJson(testInfo: TestInfo, name: string, data: unknown) {
  const path = testInfo.outputPath(name);
  await writeFile(path, JSON.stringify(data, null, 2));
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

async function openStory(page: Page, theme: string, story: string) {
  await page.addInitScript(
    value => localStorage.setItem('jovie-theme-storybook', value),
    theme
  );
  await page.goto(`/iframe.html?id=${story}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('html')).toHaveClass(new RegExp(theme));
  await page.evaluate(() => document.fonts.ready);
}

async function audit(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('[data-destructive="true"]')
    .withRules(['color-contrast'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
  const measured = result.passes
    .filter(rule => rule.id === 'color-contrast')
    .flatMap(rule => rule.nodes)
    .flatMap(node => node.any)
    .filter(check => check.id === 'color-contrast');
  expect(measured.length).toBeGreaterThan(0);
  for (const check of measured) {
    expect(check.data.contrastRatio).toBeGreaterThanOrEqual(4.5);
  }
  return measured.map(check => check.data);
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of VIEWPORTS) {
    test(`destructive confirmation is readable [${theme} ${viewport.width}] @a11y`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await openStory(page, theme, 'ui-atoms-alertdialog--destructive');
      const dialog = page.getByRole('alertdialog');
      const confirm = dialog.getByRole('button', { name: 'Remove access' });
      await expect(confirm).toHaveAttribute('data-destructive', 'true');
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      const evidence = await audit(page, confirm);
      const result = await new AxeBuilder({ page })
        .include('[role="alertdialog"]')
        .options(wcag22AaAxeOptions())
        .analyze();
      expect(result.violations).toEqual([]);
      await attachJson(testInfo, 'contrast.json', evidence);
      await testInfo.attach('destructive-dialog.png', {
        body: await page.screenshot({
          path: testInfo.outputPath('destructive-dialog.png'),
        }),
        contentType: 'image/png',
      });
    });
  }

  test(`primary destructive button states keep contrast and geometry [${theme}] @a11y`, async ({
    page,
  }, testInfo) => {
    await openStory(page, theme, 'shadcn-button--destructive');
    const button = page.getByRole('button', { name: 'Delete', exact: true });
    const bounds = await button.boundingBox();
    const evidence = { rest: await audit(page, button) } as Record<
      string,
      unknown
    >;
    await button.hover();
    evidence.hover = await audit(page, button);
    expect(await button.boundingBox()).toEqual(bounds);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    expect(await button.evaluate(el => el.matches(':focus-visible'))).toBe(
      true
    );
    evidence.focus = await audit(page, button);
    expect(await button.boundingBox()).toEqual(bounds);
    await attachJson(testInfo, 'button-states.json', evidence);

    for (const state of ['disabled', 'loading'] as const) {
      await openStory(
        page,
        theme,
        `shadcn-button--destructive&args=${state}:true`
      );
      const inactive = page.locator('button[data-destructive="true"]');
      await expect(inactive).toBeDisabled();
      await expect(inactive).toHaveAttribute('aria-disabled', 'true');
      if (state === 'loading') {
        await expect(inactive).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByRole('status')).toBeVisible();
      }
      expect(await inactive.boundingBox()).toEqual(bounds);
      // Inactive controls are exempt from WCAG text contrast. Keep them in
      // the audit to verify that Axe still recognizes their disabled state.
      const result = await new AxeBuilder({ page })
        .include('[data-destructive="true"]')
        .options(wcag22AaAxeOptions())
        .analyze();
      expect(result.violations).toEqual([]);
    }
  });
}
