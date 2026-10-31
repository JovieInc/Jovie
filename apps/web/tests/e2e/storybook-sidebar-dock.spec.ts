import { expect, test } from '@playwright/test';

const combinations = [
  ['empty', []],
  ['audio-only', ['now-playing']],
  ['whats-new-only', ['whats-new']],
  ['whats-new-and-audio', ['whats-new', 'now-playing']],
  ['update-only', ['update']],
  ['update-and-audio', ['update', 'now-playing']],
  ['update-and-whats-new', ['update']],
  ['all-three', ['update', 'now-playing']],
  ['with-install', ['update', 'now-playing']],
  ['collapsed', []],
  ['collapsed-empty', []],
] as const;

test('every stack combination fits in light and dark with 28px controls', async ({
  page,
}) => {
  test.setTimeout(240_000);
  for (const [story, order] of combinations) {
    for (const theme of ['dark', 'light']) {
      await page.goto(
        `/iframe.html?id=shell-sidebardock--${story}${theme === 'light' ? '-light' : ''}&viewMode=story`
      );
      await expect(page.locator('[data-sidebar-dock]')).toHaveCount(1);
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      const dock = page.locator('[data-sidebar-dock]');
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
        const hitHeight = await control.evaluate(node =>
          Number.parseFloat(getComputedStyle(node, '::before').height)
        );
        expect(hitHeight).toBeGreaterThanOrEqual(44);
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
  const rail = page.locator('[data-dock-preview]');
  const anchor = rail.getByTestId('nav-anchor');
  await expect(rail.locator('[data-dock-card]')).toHaveCount(2);
  const before = await anchor.boundingBox();
  const allocation = rail.locator('[data-dock-notice-slot]');
  const noticeBefore = await allocation.boundingBox();
  const audioBefore = await rail
    .locator('[data-dock-card="now-playing"]')
    .boundingBox();
  const navigationBefore = await rail.locator('nav').boundingBox();
  await rail.getByRole('button', { name: 'Dismiss update' }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  expect(await allocation.boundingBox()).toEqual(noticeBefore);
  await rail.getByRole('button', { name: "What's New", exact: true }).click();
  await expect(page.getByRole('dialog', { name: "What's New" })).toBeVisible();
  expect(await allocation.boundingBox()).toEqual(noticeBefore);
  expect(await rail.locator('nav').boundingBox()).toEqual(navigationBefore);
  await page.getByRole('button', { name: "Dismiss what's new" }).click();
  await expect(
    rail.getByRole('button', { name: 'Install Jovie', exact: true })
  ).toBeFocused();
  expect(await anchor.boundingBox()).toEqual(before);
  expect(await allocation.boundingBox()).toEqual(noticeBefore);
  await rail
    .getByRole('button', { name: 'Install Jovie', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Install Jovie' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss install prompt' }).click();
  await expect(
    rail.getByRole('button', { name: 'Pause', exact: true })
  ).toBeFocused();
  expect(await anchor.boundingBox()).toEqual(before);
  expect(await allocation.boundingBox()).toEqual(noticeBefore);
  expect(
    await rail.locator('[data-dock-card="now-playing"]').boundingBox()
  ).toEqual(audioBefore);
  expect(await rail.locator('nav').boundingBox()).toEqual(navigationBefore);
  await rail.getByRole('button', { name: 'Dismiss Player' }).click();
  expect(await anchor.boundingBox()).toEqual(before);
  expect(await rail.locator('nav').evaluate(node => node.scrollTop)).toBe(0);
});

test('collapsed status stays on the working user menu and carries tooltip text', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=shell-sidebardock--collapsed&viewMode=story'
  );
  const rail = page.locator('[data-dock-preview]');
  await expect(rail.locator('[data-dock-card]')).toHaveCount(0);
  await expect(rail.locator('[data-dock-badge]')).toHaveCount(1);
  await expect(rail.locator('[data-dock-unread]')).toHaveCount(1);
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
    const rail = page.locator('[data-dock-preview]');
    await expect(rail.locator('[data-dock-card="update"]')).toBeVisible();
    await expect(
      rail.getByRole('button', { name: 'Dismiss update' })
    ).toHaveCount(0);
    await expect(
      rail.getByRole('button', { name: /Collapse update|Expand update/ })
    ).toHaveCount(0);
    expect(
      (await rail.locator('[data-dock-notice-slot]').boundingBox())?.height
    ).toBe(28);
  }
});

test('release details are keyboard-accessible and restore focus without shifting the rail', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=shell-sidebardock--whats-new-only&viewMode=story'
  );
  const trigger = page.getByRole('button', { name: "What's New", exact: true });
  const rail = page.locator('[data-dock-preview]');
  const before = await rail.boundingBox();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: "What's New" })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View Changes' })
  ).toHaveAttribute('href', '/changelog');
  expect(await rail.boundingBox()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('collapsing the sidebar preserves outside focus after removing open dock details', async ({
  page,
}) => {
  await page.route('**/changelog/whats-new.json', route =>
    route.fulfill({
      json: {
        version: 1,
        changelogUrl: '/changelog',
        entries: [
          {
            id: 'dock-focus-release',
            title: 'Your latest releases',
            date: '2026-10-15',
            summary: 'A quieter workspace.',
            url: '/changelog',
            highlights: [],
            dogfood: [],
          },
        ],
      },
    })
  );
  for (const input of ['pointer', 'same-task'] as const) {
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--dashboard&viewMode=story'
    );
    await page.getByRole('button', { name: "What's New", exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: "What's New" })
    ).toBeVisible();
    const toggle = page.getByTestId('sidebar-rail-toggle');
    if (input === 'pointer') {
      await toggle.click();
    } else {
      await toggle.evaluate(element => {
        const button = element as HTMLButtonElement;
        button.focus();
        button.click();
      });
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Flush deferred focus recovery before checking the deliberate outside target.
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
});
