import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [390, 1440]) {
  test(`${width}px profile keeps identity editing and suppresses deferred launch controls`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const deferredRequests: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (
        [
          '/api/dashboard/shop',
          '/api/dashboard/rider',
          '/api/artist-rules',
        ].includes(path)
      ) {
        deferredRequests.push(path);
      }
    });

    await page.goto(
      `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.SETTINGS_PROFILE)}`
    );
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SETTINGS_PROFILE}$`));
    const pane = page.getByTestId('settings-shell-content');
    await expect(pane).toBeVisible();
    await expect(pane.locator('#displayName')).toBeEditable();
    await expect(
      pane.getByRole('heading', { name: 'Identity', exact: true })
    ).toBeVisible();
    for (const name of ['Payments', 'Shop', 'Rider', 'Artist Rules']) {
      await expect(
        pane.getByRole('heading', { name, exact: true })
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('status', { name: 'Loading Shop Settings' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Artist Rules', exact: true })
    ).toHaveCount(0);
    await testInfo.attach(`artist-launch-profile-${width}px`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    expect(deferredRequests).toEqual([]);
  });
}

test('deferred launch APIs refuse unauthenticated direct execution', async ({
  request,
}) => {
  for (const [route, methods] of [
    ['/api/dashboard/shop', ['GET', 'PUT']],
    ['/api/dashboard/rider', ['GET', 'PUT']],
    ['/api/artist-rules', ['GET', 'POST', 'PATCH', 'DELETE']],
  ] as const) {
    for (const method of methods) {
      const response = await request.fetch(route, { method });
      expect(response.status(), `${method} ${route}`).toBe(404);
      expect(response.headers()['cache-control']).toContain('no-store');
      await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    }
  }
});
