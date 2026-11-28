import { expect, test } from '@playwright/test';
import { controls } from './utils/shell-rail-controls';

// The Storybook session is a local synthetic identity; no customer account is used.
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Settings keeps one accessible account and logout path (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      // Install before mount so useReducedMotion and CSS see the same mode.
      Object.defineProperty(window, 'matchMedia', {
        configurable: false,
        writable: false,
        value: window.matchMedia.bind(window),
      });
      const phases = window as Window & { __settingsRailPhases?: string[] };
      phases.__settingsRailPhases = [];
      new MutationObserver(records => {
        document
          .querySelectorAll('[data-jovie-storybook-fixtures]')
          .forEach(node => node.remove());
        for (const record of records) {
          if (record.target instanceof HTMLElement) {
            const phase = record.target.dataset.railPhase;
            if (phase) phases.__settingsRailPhases?.push(phase);
          }
        }
      }).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-rail-phase'],
      });
    });
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--settings&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const settings = page.getByRole('navigation', {
      name: 'settings navigation',
    });
    await expect(settings).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches
        )
      )
      .toBe(reducedMotion === 'reduce');
    await expect(page.locator('[data-sidebar="footer"]')).toHaveCount(1);
    await expect(page.locator('[data-sidebar-dock]')).toHaveCount(0);
    const account = page.getByRole('button', { name: 'Tim White account' });
    await expect(account).toHaveCount(1);
    const toggle = controls(page, 'left');
    await expect(toggle).toHaveCount(1);
    if ((await toggle.getAttribute('aria-pressed')) === 'false')
      await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    for (let cycle = 0; cycle < 3; cycle++) {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(account).toBeVisible();
      await account.focus();
      await expect(account).toBeFocused();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(account).toBeVisible();
    }
    const phases = await page.evaluate(
      () =>
        (window as Window & { __settingsRailPhases?: string[] })
          .__settingsRailPhases ?? []
    );
    if (reducedMotion === 'no-preference') {
      expect(phases).toContain('closing');
      expect(phases).toContain('opening');
    } else {
      expect(phases).not.toContain('closing');
      expect(phases).not.toContain('opening');
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
    await account.click();
    const logout = page.getByRole('menuitem', { name: /^Sign Out/i });
    await expect(logout).toBeVisible();
    await logout.focus();
    await Promise.all([
      page.waitForURL(url => url.pathname === '/signin'),
      page.keyboard.press('Enter'),
    ]);
  });
}
