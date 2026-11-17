import { expect, test } from '@playwright/test';

// The Storybook session is a local synthetic identity; no customer account is used.
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Settings keeps dock/profile content and one accessible logout path (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--settings&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const settings = page.getByRole('navigation', {
      name: 'settings navigation',
    });
    await expect(settings).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-sidebar="footer"]')).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: /^Public Profile/ })
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-testid="sidebar-user-panel"] [data-slot="common-dropdown-trigger"]'
      )
    ).toHaveCount(0);
    const logout = settings.getByRole('button', {
      name: 'Sign Out',
      exact: true,
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      const collapse = page.getByRole('button', {
        name: 'Collapse sidebar',
        exact: true,
      });
      await collapse.click();
      await expect(logout).toBeVisible();
      await expect(logout).toBeEnabled();
      await logout.focus();
      await expect(logout).toBeFocused();
      const expand = page.getByRole('button', {
        name: 'Expand sidebar',
        exact: true,
      });
      await expand.click();
      await expect(
        page.getByRole('link', { name: /^Public Profile/ })
      ).toBeVisible();
    }
    // Record the real Better Auth client's local sign-out request and fulfill it
    // through the preview's documented API mock, then observe its hard navigation.
    await page.evaluate(() => {
      const fixture = window as Window & {
        __jovieApiMock?: (request: {
          url: URL;
          init?: RequestInit;
        }) => Response | Promise<Response> | undefined;
      };
      const previous = fixture.__jovieApiMock;
      fixture.__jovieApiMock = request =>
        request.url.pathname.endsWith('/sign-out')
          ? Response.json({ success: true })
          : previous?.(request);
    });
    await logout.focus();
    await Promise.all([
      page.waitForURL(url => url.pathname === '/signin'),
      page.keyboard.press('Enter'),
    ]);
  });
}
