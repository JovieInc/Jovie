import { expect, test } from '@playwright/test';

test('uses all the table space beside the rail and keeps a large suggestion queue scrollable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 800 });
  await page.goto(
    '/iframe.html?id=presence-profilespublicsources--many-suggested-profiles&viewMode=story'
  );
  const workspace = page.getByTestId('profiles-workspace');
  const table = workspace.getByRole('table');
  const firstRow = table.locator('tbody tr').first();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByLabel('Presence details', { exact: true })
  ).toBeVisible();

  await expect
    .poll(() =>
      table.evaluate(element => {
        const workspace = element.closest('[data-testid="profiles-workspace"]');
        return Math.abs(
          (workspace?.clientWidth ?? 0) - element.getBoundingClientRect().width
        );
      })
    )
    .toBeLessThanOrEqual(1);

  await workspace
    .getByRole('button', { name: 'Review Suggestions (24)' })
    .click();
  const queue = page.getByTestId('suggested-connections-review').locator('..');
  await expect(queue).toBeVisible();
  const bounds = await queue.evaluate(element => {
    const panel = element.parentElement!;
    return {
      queue: element.clientHeight,
      queueContent: element.scrollHeight,
      panel: panel.clientHeight,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(bounds.queueContent).toBeGreaterThan(bounds.queue);
  expect(bounds.queue).toBeLessThanOrEqual(bounds.panel / 2 + 1);
  expect(bounds.documentOverflow).toBeLessThanOrEqual(0);
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  const scrollContainer = table.locator('..');
  await scrollContainer.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(table.locator('tbody tr').last()).toBeInViewport({ ratio: 1 });
  await queue.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    queue.getByTestId('suggested-connection-row').last()
  ).toBeInViewport();
  await expect(
    page.getByLabel('Presence details', { exact: true })
  ).toBeVisible();

  await workspace.getByRole('button', { name: 'Close Suggestions' }).click();
  await workspace.getByRole('button', { name: 'Add Profile Or Site' }).click();
  await page
    .getByRole('complementary', { name: 'Add Profile Or Site' })
    .getByRole('button', { name: /Review Suggestions/ })
    .click();
  await expect(page.getByTestId('suggested-connections-review')).toBeFocused();
});

test('edits the Jovie contact in place and shows a fix action for observed contacts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    '/iframe.html?id=presence-profilespublicsources--combined-identity-actions-and-review&viewMode=story'
  );
  const workspace = page.getByTestId('profiles-workspace');
  const details = page.getByRole('complementary', { name: 'Presence details' });
  await workspace.getByRole('button', { name: 'Edit Jovie Profile' }).click();
  await expect(details.getByRole('textbox', { name: 'Bio' })).toHaveValue(
    'Artist and producer.'
  );
  await expect(
    details.getByRole('textbox', { name: 'Display name' })
  ).toBeEditable();
  await expect(
    details.getByRole('button', { name: 'Fix With Jovie' })
  ).toHaveCount(0);

  await workspace.getByRole('row', { name: /SoundCloud/ }).click();
  await expect(
    details.getByRole('button', { name: 'Fix With Jovie' })
  ).toBeVisible();
  await expect(details.getByRole('textbox')).toHaveCount(0);
});
