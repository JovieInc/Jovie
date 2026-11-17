import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

export async function installElectronRuntime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });
    document.documentElement.dataset.desktopRuntime = 'electron';
  });
}

export async function forceElectronRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });
    document.documentElement.dataset.desktopRuntime = 'electron';
  });
  // JOV-8941: flipping the runtime attribute re-applies the electron padding
  // rules, and the shell body animates gap/padding (SHELL_RAIL_FRAME_GAP,
  // duration-cinematic). A real Electron preload sets the attribute before
  // first paint so no transition runs there; in this simulated runtime the
  // geometry must wait for the shell chain (body, main plane, #main-content)
  // to reach animation rest before anything is measured.
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('[data-app-shell-body="true"]');
      if (!shell) return false;
      const targets = [
        shell,
        document.querySelector('[data-app-shell-main-plane="true"]'),
        document.querySelector('#main-content'),
      ];
      return targets.every(
        el => el === null || el.getAnimations().length === 0
      );
    },
    { timeout: 10_000 }
  );
}

export async function gotoShellRoute(
  page: Page,
  route: string = APP_ROUTES.CALENDAR,
  persona: 'admin' | 'creator-ready' = 'creator-ready'
): Promise<void> {
  const maxAttempts = 3;
  const authEntryUrl = `/api/dev/test-auth/enter?persona=${persona}&redirect=${encodeURIComponent(
    route
  )}`;
  const routePattern = new RegExp(route.replaceAll('/', '\\/'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(authEntryUrl, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForURL(routePattern, { timeout: 60_000 });
      await forceElectronRuntime(page);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts &&
        /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ECONNRESET/i.test(message);
      if (!shouldRetry) throw error;
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

// Streaming can briefly hold a suspended copy of the shell next to the
// resolved one; geometry is only meaningful once exactly one frame remains.
export async function waitForSettledShell(page: Page): Promise<void> {
  const frame = page.locator('[data-app-shell-frame="true"]');
  await expect(frame).toHaveCount(1, { timeout: 30_000 });
  await expect(frame).toBeVisible();
}
