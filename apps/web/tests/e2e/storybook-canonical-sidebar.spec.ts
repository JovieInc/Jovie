import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`canonical sidebar keeps geometry and keyboard actions in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--dashboard&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    await expect(
      nav.getByRole('button', { name: 'Recent Chats' })
    ).toBeVisible();
    const footer = page.locator('[data-sidebar="footer"]');
    const before = await footer.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.y + before!.height).toBeCloseTo(
      page.viewportSize()!.height,
      0
    );
    const home = nav.getByRole('link', { name: 'Home' });
    const row = await home.boundingBox();
    expect(row!.height).toBe(28);
    const create = nav.getByRole('link', { name: 'New Chat' });
    const colors = await create.evaluate(element => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(colors.foreground).not.toBe(colors.background);
    await nav.getByRole('button', { name: 'Recent Chats' }).click();
    const recent = page.locator('[data-sidebar-flyout="recent"]');
    await expect(recent.getByText('Today', { exact: true })).toBeVisible();
    await expect(recent.getByText('Earlier', { exact: true })).toBeVisible();
    await recent.getByRole('button', { name: 'Filter Unread Chats' }).focus();
    await page.keyboard.press('Enter');
    await expect(recent.getByText('No unread chats')).toBeVisible();
    expect(await footer.boundingBox()).toEqual(before);
    await page.keyboard.press('Enter');
    await expect(recent.getByText('Merch drop checklist')).toBeVisible();
    expect(await footer.boundingBox()).toEqual(before);
    await expect(
      recent.getByRole('link', { name: 'All chats' })
    ).toHaveAttribute('href', '/app/chats');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`canonical-sidebar-${theme}.png`),
    });
  });
}
