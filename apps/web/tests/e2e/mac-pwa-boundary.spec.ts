import { expect, test } from '@playwright/test';

/** Hosted renderer proof. Native main-process delivery has its own Mac acceptance. */
test('Mac shell rejects a direct public/PWA route and retains a supported recovery destination', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        platform: 'darwin',
        electronVersion: '44.7.2',
        navigationBoundaryVersion: 1,
        windowRole: 'main',
        onUpdateAvailable: () => () => {},
        onUpdateDownloaded: () => () => {},
        installUpdateAndRestart: async () => ({ ok: false }),
        goBack: async () => {},
        goForward: async () => {},
        onNavStateChanged: () => () => {},
        routeNavigation: async () => ({ ok: true }),
      },
    });
  });
  await page.goto('/download?runtime=electron', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-page="download"]')).toHaveCount(0);
  await expect(page).toHaveURL(
    /\/(?:app(?:\/|\?|$)|signin(?:\?|$)|desktop-auth(?:\?|$)|start(?:\?|$))/,
    { timeout: 90_000 }
  );
  await expect(page.locator('[data-page="download"]')).toHaveCount(0);
});

test('ordinary web keeps the public download route and displays the supported Mac floor', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-page="download"]')).toBeVisible();
  await expect(
    page.getByText('macOS 13 Ventura or later', { exact: true })
  ).toBeVisible();
});
