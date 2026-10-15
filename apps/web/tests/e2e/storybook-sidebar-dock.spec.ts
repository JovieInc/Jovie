import { expect, test } from '@playwright/test';

const combinations = [
  ['empty', []],
  ['audio-only', ['now-playing']],
  ['whats-new-only', ['whats-new']],
  ['whats-new-and-audio', ['whats-new', 'now-playing']],
  ['update-only', ['update']],
  ['update-and-audio', ['update', 'now-playing']],
  ['update-and-whats-new', ['update', 'whats-new']],
  ['all-three', ['update', 'whats-new', 'now-playing']],
  ['with-install', ['update', 'whats-new', 'now-playing', 'install']],
] as const;

test('every stack combination fits in light and dark with 28px controls', async ({
  page,
}) => {
  test.setTimeout(240_000);
  for (const [story, order] of combinations) {
    await page.goto(
      `/iframe.html?id=shell-sidebardock--${story}&viewMode=story`
    );
    await expect(page.locator('[data-sidebar-dock]')).toHaveCount(2);
    for (const theme of ['light', 'dark']) {
      const dock = page.locator(
        `[data-dock-theme="${theme}"] [data-sidebar-dock]`
      );
      await expect(dock.locator('[data-dock-card]')).toHaveCount(order.length);
      expect(
        await dock
          .locator('[data-dock-card]')
          .evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('data-dock-card'))
          )
      ).toEqual([...order]);
      expect(
        await dock.evaluate(node => node.scrollWidth <= node.clientWidth)
      ).toBe(true);
      for (const control of await dock.getByRole('button').all()) {
        expect((await control.boundingBox())?.height).toBe(28);
      }
    }
  }
});

test('dock changes preserve navigation coordinates and scroll', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=shell-sidebardock--with-install&viewMode=story'
  );
  const rail = page.locator('[data-dock-theme="light"]');
  const anchor = rail.getByTestId('nav-anchor');
  await expect(rail.locator('[data-dock-card]')).toHaveCount(4);
  const before = await anchor.boundingBox();
  await rail.getByRole('button', { name: 'Collapse update' }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  await rail.getByRole('button', { name: "Dismiss what's new" }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  await rail.getByRole('button', { name: 'Dismiss Player' }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  await rail.getByRole('button', { name: 'Dismiss Prompt' }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  expect(await rail.locator('nav').evaluate(node => node.scrollTop)).toBe(0);
});

test('collapsed status stays on the working user menu and carries tooltip text', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=shell-sidebardock--collapsed&viewMode=story'
  );
  const rail = page.locator('[data-dock-theme="light"]');
  await expect(rail.locator('[data-dock-card]')).toHaveCount(0);
  await expect(rail.locator('[data-dock-badge]')).toHaveCount(3);
  const user = rail.getByRole('button', {
    name: /Open user menu · Update available/,
  });
  await user.hover();
  await expect(page.getByRole('tooltip')).toContainText(
    "What's new: Your latest releases"
  );
  await user.click();
  await expect(page.getByRole('menu')).toBeVisible();
});

test('downloading and ready updates stay visible and cannot be dismissed', async ({
  page,
}) => {
  for (const story of ['downloading', 'ready']) {
    await page.goto(
      `/iframe.html?id=shell-sidebardock--${story}&viewMode=story`
    );
    const rail = page.locator('[data-dock-theme="light"]');
    await expect(rail.locator('[data-dock-card="update"]')).toBeVisible();
    await expect(
      rail.getByRole('button', { name: 'Dismiss update' })
    ).toHaveCount(0);
    await rail.getByRole('button', { name: 'Collapse update' }).click();
    await expect(
      rail.getByRole('button', { name: 'Expand update' })
    ).toHaveAttribute('aria-expanded', 'false');
  }
});
