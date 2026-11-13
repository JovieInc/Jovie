import { expect, test } from '@playwright/test';

// The queue fixture reads seeded data only; row actions open the inspector.
test.describe('Outbound review geometry', () => {
  test('preserves a long imported identity while keeping its review action in view', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      '/iframe.html?id=admin-outbound-workspace--long-imported-identity&viewMode=story'
    );
    await page.getByRole('button', { name: /Needs evidence 1/ }).click();
    const row = page.locator('[data-testid^="outbound-row-"]');
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(
      row.getByTitle('Ada — Listen on YouTube, Spotify, Apple Music')
    ).toHaveText('Ada — Listen on YouTube, Spotify, Apple Music');
    const action = row.getByRole('button', { name: 'Gather Evidence' });
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect((await row.boundingBox())!.height).toBe(40);
    await row.focus();
    await page.keyboard.press('Tab');
    await expect(row.getByRole('checkbox')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(action).toBeFocused();
  });

  for (const width of [390, 768, 1440]) {
    test(`keeps review actions and visible statuses readable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        '/iframe.html?id=admin-outbound-workspace--queue&viewMode=story'
      );
      const table = page.getByTestId('ovie-outbound-table');
      await expect(table).toBeVisible({ timeout: 60_000 });
      const rows = page.locator('[data-testid^="outbound-row-"]');
      await expect(rows).toHaveCount(2);
      const tableBox = await table.boundingBox();
      expect(tableBox).not.toBeNull();
      for (const row of await rows.all()) {
        const action = row.getByRole('button', { name: 'Review Facts' });
        const actionBox = await action.boundingBox();
        expect(actionBox).not.toBeNull();
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
          tableBox!.x + tableBox!.width
        );
        expect((await row.boundingBox())!.height).toBe(40);
      }
      for (const status of await table
        .getByText(/^(Not scored|Presence only)$/)
        .all()) {
        await expect(status).toBeVisible();
        const fits = await status.evaluate(element => {
          const cell = element.closest('[data-table-cell-content]')!;
          const range = document.createRange();
          range.selectNodeContents(element);
          return (
            range.getBoundingClientRect().right <=
            cell.getBoundingClientRect().right
          );
        });
        expect(fits).toBe(true);
      }
      await rows.first().click();
      await rows.nth(1).hover();
      await expect(rows.first()).toHaveClass(/system-b-table-row-selected/);
      await expect(rows.nth(1)).not.toHaveClass(/system-b-table-row-selected/);
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('j');
        await expect(rows.nth(1)).toHaveClass(/system-b-table-row-selected/);
        await page.keyboard.press('k');
        await expect(rows.first()).toHaveClass(/system-b-table-row-selected/);
      }
    });
  }
});
