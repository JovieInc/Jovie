import { expect, test } from '@playwright/test';

// The queue fixture reads seeded data only; row actions open the inspector.
test.describe('Outbound review geometry', () => {
  test('keeps relationship holds explicit in a compact row with multiple source notes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      '/iframe.html?id=admin-outbound-workspace--relationship-notes&viewMode=story'
    );
    await page.getByRole('button', { name: /All Outbound views/ }).click();
    await page.getByRole('menuitemradio', { name: 'Held 1' }).click();
    const row = page.locator('[data-testid^="outbound-row-"]');
    const hold = row.getByTestId('outbound-flag-existing-relationship');
    await expect(hold).toHaveText('Existing relationship');
    await expect(hold).toHaveAttribute(
      'title',
      'Existing relationship: flag to Tim, no cold outreach'
    );
    const rowBox = (await row.boundingBox())!;
    const holdBox = (await hold.boundingBox())!;
    expect(rowBox.height).toBe(40);
    expect(holdBox.y + holdBox.height).toBeLessThanOrEqual(
      rowBox.y + rowBox.height
    );
    const notes = hold.locator('..');
    expect(
      await hold.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return (
          range.getBoundingClientRect().right <=
          element.parentElement!.getBoundingClientRect().right
        );
      })
    ).toBe(true);
    await expect(row.getByTestId('outbound-relationship-note')).toHaveAttribute(
      'title',
      'Relationship note retained from source'
    );
    await expect(row.getByTestId('outbound-flag-non-artist')).toHaveText(
      'Possible non-artist'
    );
    await notes.hover();
    await page.mouse.wheel(600, 0);
    await expect
      .poll(() => notes.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0);
    const action = row.getByRole('button', { name: /^Review / });
    const box = await action.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveClass(/system-b-table-row-selected/);
  });

  test('preserves a long imported identity while keeping its review action in view', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      '/iframe.html?id=admin-outbound-workspace--long-imported-identity&viewMode=story'
    );
    await page.getByRole('button', { name: /All Outbound views/ }).click();
    await page.getByRole('menuitemradio', { name: 'Needs evidence 1' }).click();
    const row = page.locator('[data-testid^="outbound-row-"]');
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(
      row.getByTitle('Ada — Listen on YouTube, Spotify, Apple Music')
    ).toHaveText('Ada — Listen on YouTube, Spotify, Apple Music');
    const action = row.getByRole('button', { name: /^Review / });
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
        const action = row.getByRole('button', { name: /^Review / });
        const actionBox = await action.boundingBox();
        expect(actionBox).not.toBeNull();
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
          tableBox!.x + tableBox!.width
        );
        expect((await row.boundingBox())!.height).toBe(40);
      }
      for (const status of await table.getByText(/^Presence only$/).all()) {
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

      const views = page.getByRole('button', { name: /All Outbound views/ });
      const viewsBox = await views.boundingBox();
      expect(viewsBox!.x + viewsBox!.width).toBeLessThanOrEqual(width);
      await views.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('menuitemradio', { name: 'Sent 1' })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitemradio', { name: 'Paid 0' })
      ).toBeVisible();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Nobody in Rejected')).toBeVisible();
      await views.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await expect(rows).toHaveCount(2);

      const shortcuts = page.getByText('Keyboard shortcuts');
      await shortcuts.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(/j\/k person/)).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.getByText(/j\/k person/)).not.toBeVisible();
      await expect(
        page.getByText(
          'Approving records your decision; nothing sends automatically.'
        )
      ).toBeVisible();
    });
  }

  test('keeps scored bands and presence-only provenance beside explicit unknown markers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      '/iframe.html?id=admin-outbound-workspace--mixed-scores&viewMode=story'
    );
    await expect(page.getByTestId('ovie-outbound-table')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTitle('High. Ability to pay band')).toHaveText(
      'High'
    );
    await expect(page.getByTitle('Med. Buying intent band')).toHaveText('Med');
    const unknown = page.getByTitle('Not scored. Ability to pay band');
    await expect(
      unknown.getByRole('img', { name: 'Not scored' })
    ).toBeVisible();
    await expect(page.getByText('Presence only')).toBeVisible();
    await expect(page.getByText('Not scored or no trigger')).toBeVisible();
  });

  test('collapses views by available table width on a desktop viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      '/iframe.html?id=admin-outbound-workspace--queue&viewMode=story'
    );
    await page.getByTestId('ovie-outbound-page').evaluate(element => {
      element.style.width = '420px';
    });
    await expect(
      page.getByRole('button', { name: 'Ready to certify 2', exact: true })
    ).not.toBeVisible();
    const menu = page.getByRole('button', { name: /All Outbound views/ });
    const box = await menu.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(420);
    await menu.click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Sent 1' })
    ).toBeVisible();
  });
});
