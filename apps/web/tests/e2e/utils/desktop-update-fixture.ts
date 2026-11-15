import type { Page } from '@playwright/test';

/**
 * Fake Electron bridge for runtime-update stories: records the update
 * callbacks the shell subscribes to so a spec can fire "available" and
 * "downloaded" itself, and counts installUpdateAndRestart calls.
 */
interface DesktopUpdateFixtureWindow {
  available?: () => void;
  downloaded?: () => void;
  installs: number;
  electronAPI: unknown;
}

export async function installDesktopUpdateFixture(page: Page) {
  await page.addInitScript(() => {
    const fixture = window as unknown as DesktopUpdateFixtureWindow;
    fixture.installs = 0;
    fixture.electronAPI = {
      platform: 'darwin',
      electronVersion: 'fixture',
      onUpdateAvailable: (cb: () => void) => {
        fixture.available = cb;
        return () => {};
      },
      onUpdateDownloaded: (cb: () => void) => {
        fixture.downloaded = cb;
        return () => {};
      },
      installUpdateAndRestart: () => {
        fixture.installs++;
      },
    };
  });
}

/** Type of the subscribed callback; `'function'` once the shell listens. */
export function desktopUpdateListener(
  page: Page,
  event: 'available' | 'downloaded'
) {
  return page.evaluate(
    name => typeof (window as unknown as DesktopUpdateFixtureWindow)[name],
    event
  );
}

export async function fireDesktopUpdate(
  page: Page,
  event: 'available' | 'downloaded'
) {
  await page.evaluate(name => {
    const listener = (window as unknown as DesktopUpdateFixtureWindow)[name];
    if (typeof listener !== 'function')
      throw new Error(`the shell never subscribed to update ${name}`);
    listener();
  }, event);
}

export function desktopUpdateInstalls(page: Page) {
  return page.evaluate(
    () => (window as unknown as DesktopUpdateFixtureWindow).installs
  );
}
