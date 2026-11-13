import { expect, type Locator, test } from '@playwright/test';

async function expectCenteredControl(row: Locator) {
  const geometry = await row.evaluate(element => {
    const trigger = element.querySelector<HTMLButtonElement>(
      'button[aria-label="More actions"]'
    )!;
    const icon = trigger.querySelector('svg')!;
    const content = trigger.closest('[data-table-cell-content]')!;
    const rowBounds = element.getBoundingClientRect();
    const buttonBounds = trigger.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const center = (rect: DOMRect) => rect.top + rect.height / 2;
    return {
      buttonOffset: center(buttonBounds) - center(rowBounds),
      iconOffset: center(iconBounds) - center(buttonBounds),
      clippedTop: contentBounds.top - buttonBounds.top,
      clippedBottom: buttonBounds.bottom - contentBounds.bottom,
      height: buttonBounds.height,
      width: buttonBounds.width,
      rowHeight: rowBounds.height,
    };
  });
  expect(
    Math.abs(geometry.buttonOffset),
    'row action centers on the row'
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(geometry.iconOffset),
    'glyph centers inside the trigger'
  ).toBeLessThanOrEqual(0.5);
  expect(
    geometry.clippedTop,
    'hover/focus face is not clipped at top'
  ).toBeLessThanOrEqual(0);
  expect(
    geometry.clippedBottom,
    'hover/focus face is not clipped at bottom'
  ).toBeLessThanOrEqual(0);
  expect(geometry.width).toBe(geometry.height);
  expect(geometry.height).toBeGreaterThanOrEqual(24);
  return geometry;
}

for (const mode of ['dense', 'compact', 'default']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      test(`Contacts row actions: ${mode}, ${theme}, ${width}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(
          value => localStorage.setItem('jovie-theme-storybook', value),
          theme
        );
        await page.goto(
          `/iframe.html?id=dashboard-contacts-rowalignment--${mode}&viewMode=story`
        );
        const row = page.getByTestId('synthetic-booking');
        const trigger = row.getByRole('button', { name: 'More actions' });
        await expect(row).toBeVisible();
        const resting = await expectCenteredControl(row);
        await row.hover();
        await expect(trigger).toHaveCSS('opacity', '1');
        expect(await expectCenteredControl(row)).toEqual(resting);
        await testInfo.attach('hover.png', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        // Native Tab navigation must reach the control and reveal it without hover.
        await page.mouse.move(0, 0);
        for (
          let count = 0;
          count < 20 &&
          !(await trigger.evaluate(el => el === document.activeElement));
          count += 1
        ) {
          await page.keyboard.press('Tab');
        }
        await expect(trigger).toBeFocused();
        expect(await expectCenteredControl(row)).toEqual(resting);
        await testInfo.attach('focus.png', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await expect(
          page.locator('output[aria-label="Selected contact"]')
        ).toHaveText('None');
        expect(await expectCenteredControl(row)).toEqual(resting);
        await testInfo.attach('open.png', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toHaveCount(0);
        await expect(trigger).toBeFocused();
        // Pointer activation is also isolated from row selection.
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Delete contact' }).click();
        await expect(
          page.locator('output[aria-label="Action count"]')
        ).toHaveText('1');
        await expect(
          page.locator('output[aria-label="Selected contact"]')
        ).toHaveText('None');
        await expect(trigger).toBeFocused();
        await row.getByText('Alex Example').click();
        await expect(
          page.locator('output[aria-label="Selected contact"]')
        ).toHaveText('synthetic-booking');
        expect(await expectCenteredControl(row)).toEqual(resting);
      });
    }
  }
}
