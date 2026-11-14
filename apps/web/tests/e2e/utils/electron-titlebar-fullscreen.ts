/** Native fullscreen reserve regression. @smoke */
import { expect, test } from '@playwright/test';
import {
  gotoShellRoute,
  installElectronRuntime,
  waitForSettledShell,
} from './electron-titlebar-runtime';

export function registerElectronTitlebarFullscreenTest(): void {
  test('full-screen Electron shell collapses the native safe area while preserving the title row', async ({
    page,
  }) => {
    // The authenticated E2E lane must provide its normal test-auth setup.
    expect(process.env.E2E_USE_TEST_AUTH_BYPASS).toBe('1');
    test.setTimeout(180_000);

    await installElectronRuntime(page);
    await gotoShellRoute(page);
    await waitForSettledShell(page);

    // JOV-8940: macOS hides the native lights in full screen. The renderer
    // mirrors the native state onto the document root, so the reserve
    // collapses to zero while the 44pt title row keeps its height.
    await page.evaluate(() => {
      document.documentElement.dataset.electronFullscreen = 'true';
    });

    await expect(
      page.getByTestId('electron-traffic-light-safe-area')
    ).toHaveCSS('width', '0px');
    await expect(
      page.locator('[data-app-shell-sidebar-mount="true"]')
    ).toHaveCSS('padding-top', '44px');
    await expect(page.getByTestId('electron-titlebar-row')).toHaveCSS(
      'height',
      '44px'
    );
  });
}
