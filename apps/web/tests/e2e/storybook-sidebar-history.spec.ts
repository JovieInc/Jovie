import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`history keeps one status signal and stable action space in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(
      '/iframe.html?id=shell-sidebarthreadssection--calm-activity&viewMode=story'
    );
    const working = page.getByRole('link', {
      name: 'Preparing release notes',
      exact: true,
    });
    await expect(working).toBeVisible({ timeout: 60_000 });
    await expect(working).toHaveAccessibleDescription('Working');
    await expect(
      page.getByRole('link', {
        name: 'Distribution needs attention',
        exact: true,
      })
    ).toHaveAccessibleDescription('Needs attention · Unread');
    await expect(
      page.getByRole('link', {
        name: 'Your campaign is ready to review',
        exact: true,
      })
    ).toHaveAccessibleDescription('Unread');
    const action = page.getByRole('button', {
      name: 'Chat Actions for Preparing release notes',
      exact: true,
    });
    const date = working.locator('time');
    const label = working.getByText('Preparing release notes', { exact: true });
    const before = await label.boundingBox();
    await expect(date).toHaveCSS('opacity', '1');
    await working.hover();
    await expect(date).toHaveCSS('opacity', '0');
    await expect(action).toHaveCSS('opacity', '1');
    expect(await label.boundingBox()).toEqual(before);
    await page.mouse.move(500, 500);
    await working.focus();
    await expect(date).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS('opacity', '1');
    expect(await label.boundingBox()).toEqual(before);
    const labelBounds = await label.boundingBox();
    const actionBounds = await action.boundingBox();
    expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(
      actionBounds!.x
    );
    // Exercise real CSS motion instead of Storybook's frozen screenshot fixture.
    await page
      .locator('style[data-jovie-storybook-fixtures]')
      .evaluate(element => element.remove());
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(working.locator('.animate-spin')).toHaveCSS(
      'animation-name',
      'spin'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(working.locator('.animate-spin')).toHaveCSS(
      'animation-name',
      'none'
    );
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-history-${theme}.png`),
    });
  });
}

test('touch history exposes actions without a competing timestamp', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: testInfo.project.use.baseURL,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(
    '/iframe.html?id=shell-sidebarthreadssection--calm-activity&viewMode=story'
  );
  const row = page.getByRole('link', {
    name: 'Preparing release notes',
    exact: true,
  });
  const action = page.getByRole('button', {
    name: 'Chat Actions for Preparing release notes',
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(action).toHaveCSS('opacity', '1');
  await expect(row.locator('time')).toHaveCSS('opacity', '0');
  await action.tap();
  await page.screenshot({
    path: testInfo.outputPath('sidebar-history-touch.png'),
  });
  await context.close();
});
