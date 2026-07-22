import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

test.describe('OV shell access boundary @smoke', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'dev-auth bypass not enabled — set E2E_USE_TEST_AUTH_BYPASS=1'
  );

  test('authorized OV HTML is canonical and starts in the OV skin', async ({
    page,
  }) => {
    await page.goto(
      `/api/dev/test-auth/enter?persona=admin&redirect=${APP_ROUTES.ADMIN_FEATURES}`
    );
    await page.waitForURL(APP_ROUTES.ADMIN_FEATURES);

    const response = await page.request.get(APP_ROUTES.ADMIN_FEATURES, {
      maxRedirects: 0,
    });
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(APP_ROUTES.ADMIN_FEATURES);
    expect(html).toContain('ov-mode');
    expect(html).not.toContain('>Jovie<');
    expect(html).toContain('Runtime feature flags');
  });

  test('non-admin OV HTML contains only the trusted OV fallback and server redirect', async ({
    page,
  }) => {
    await page.goto(
      `/api/dev/test-auth/enter?persona=creator-ready&redirect=${APP_ROUTES.CHAT}`
    );
    await page.waitForURL(APP_ROUTES.CHAT);

    const response = await page.request.get(APP_ROUTES.ADMIN_FEATURES, {
      maxRedirects: 0,
    });
    const html = await response.text();

    // Next may stream app/loading.tsx before emitting the server RSC redirect,
    // so transport status remains 200. The response must still contain only
    // the trusted OV fallback, never customer chrome or privileged page data.
    expect(response.status()).toBe(200);
    expect(html).toContain('ov-mode');
    expect(html).not.toContain('>Jovie<');
    expect(html).not.toContain('Runtime feature flags');
    expect(html).toContain('NEXT_REDIRECT');
    expect(html).toContain('replace;/app;307');
  });
});
