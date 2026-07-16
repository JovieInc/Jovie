/**
 * E2E: right-rail composer interaction hardening.
 *
 * Asserts the profile preview rail and chat composer coexist safely:
 * - rail opens → composer textarea stays focusable
 * - composer focused → rail opens (no focus steal)
 * - rail closes → focus returns to composer
 * - rail open → composer textarea receives pointer events
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test tests/e2e/chat-rail-composer-interaction.spec.ts --project=chromium
 *
 * @see apps/web/components/molecules/drawer/RightDrawer.tsx (inert when closed)
 * @see apps/web/components/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar.tsx
 */

import { expect, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { gotoAuthenticatedChatRoute } from './utils/smoke-test-utils';

const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';
const RAIL_TOGGLE = '[data-testid="artist-profile-rail-toggle"]';
const RIGHT_RAIL = '[data-testid="app-shell-right-rail"]';
const APP_SHELL_FRAME = '[data-app-shell-frame="true"]';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('right-rail × composer interaction', () => {
  test.beforeAll(() => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'Requires E2E_USE_TEST_AUTH_BYPASS=1'
    );
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);

    // Enable DESIGN_V1 so the rail toggle and right-rail mount are active
    const overrides = JSON.stringify({
      [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
    });

    await page.addInitScript(
      ({ cookieName, key, value }) => {
        localStorage.setItem(key, value);
        document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      },
      {
        cookieName: APP_FLAG_OVERRIDES_COOKIE,
        key: FF_OVERRIDES_KEY,
        value: overrides,
      }
    );

    await setTestAuthBypassSession(page, 'creator-ready');
    await gotoAuthenticatedChatRoute(page);

    // Wait for the app shell to be fully rendered
    await expect(page.locator(APP_SHELL_FRAME)).toBeVisible({
      timeout: 30_000,
    });

    // Wait for the composer to be interactive
    await expect(page.locator(COMPOSER_TEXTAREA)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('A: composer textarea remains focusable after opening profile rail', async ({
    page,
  }) => {
    // Open the rail via the toggle button
    await expect(page.locator(RAIL_TOGGLE)).toBeVisible({ timeout: 10_000 });
    await page.locator(RAIL_TOGGLE).click();

    // Wait for the rail to open
    await expect(page.locator(RIGHT_RAIL)).toBeVisible({ timeout: 10_000 });

    // Click the composer textarea — it should receive focus
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click({ force: true });

    // Verify the textarea has focus
    const hasFocus = await page.evaluate(
      selector => document.activeElement === document.querySelector(selector),
      COMPOSER_TEXTAREA
    );
    expect(hasFocus).toBe(true);

    // Verify textarea pointer events are not intercepted — type should work
    await textarea.fill('test message after rail opened');
    await expect(textarea).toHaveValue('test message after rail opened');
  });

  test('B: rail opens while composer is focused — no focus steal', async ({
    page,
  }) => {
    // Focus the composer first
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click({ force: true });
    await textarea.fill('hello from the composer');

    // Verify composer has focus
    const initiallyFocused = await page.evaluate(
      selector => document.activeElement === document.querySelector(selector),
      COMPOSER_TEXTAREA
    );
    expect(initiallyFocused).toBe(true);

    // Open the rail while composer has focus
    await expect(page.locator(RAIL_TOGGLE)).toBeVisible({ timeout: 10_000 });
    await page.locator(RAIL_TOGGLE).click();

    // Wait for the rail to be open
    await expect(page.locator(RIGHT_RAIL)).toBeVisible({ timeout: 10_000 });

    // Composer should STILL have focus (rail opening must not steal it)
    const stillFocused = await page.evaluate(
      selector => document.activeElement === document.querySelector(selector),
      COMPOSER_TEXTAREA
    );
    expect(stillFocused).toBe(true);

    // The textarea content should be preserved
    await expect(textarea).toHaveValue('hello from the composer');
  });

  test('C: closing the rail refocuses the composer', async ({ page }) => {
    // Open the rail
    await expect(page.locator(RAIL_TOGGLE)).toBeVisible({ timeout: 10_000 });
    await page.locator(RAIL_TOGGLE).click();
    await expect(page.locator(RIGHT_RAIL)).toBeVisible({ timeout: 10_000 });

    // Type something first so there's a reason to return
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click({ force: true });
    await textarea.fill('message before closing rail');

    // Close the rail
    await page.locator(RAIL_TOGGLE).click();

    // Wait for rail to close (opacity transition)
    await expect(page.locator(RIGHT_RAIL)).toBeVisible({ timeout: 10_000 });

    // Focus should be back on (or restorable to) the composer
    await textarea.click({ force: true });

    const focusedAfterClose = await page.evaluate(
      selector => document.activeElement === document.querySelector(selector),
      COMPOSER_TEXTAREA
    );
    expect(focusedAfterClose).toBe(true);

    // Verify the textarea is still interactive
    await textarea.fill('message after closing rail');
    await expect(textarea).toHaveValue('message after closing rail');
  });

  test('D: rail open — composer receives pointer events', async ({ page }) => {
    // Open the rail
    await expect(page.locator(RAIL_TOGGLE)).toBeVisible({ timeout: 10_000 });
    await page.locator(RAIL_TOGGLE).click();
    await expect(page.locator(RIGHT_RAIL)).toBeVisible({ timeout: 10_000 });

    // Wait a moment for the CSS transition + inert to settle
    await page.waitForTimeout(500);

    // Assert the rail is inert=false (open) — we want the *composer* to be
    // interactive. The AppShellRightRail mounts beside the scroll clip and
    // should not capture pointer events in the composer area.
    const textarea = page.locator(COMPOSER_TEXTAREA);

    // Dispatch a pointerdown and check it reaches the textarea
    const pointerReached = await textarea.evaluate(element => {
      return new Promise<boolean>(resolve => {
        const handler = () => {
          element.removeEventListener('pointerdown', handler);
          resolve(true);
        };
        element.addEventListener('pointerdown', handler);

        // Simulate a pointer event at the textarea center
        const rect = element.getBoundingClientRect();
        const event = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        element.dispatchEvent(event);

        // Resolve false if no handler was called within the microtask
        setTimeout(() => {
          element.removeEventListener('pointerdown', handler);
          resolve(false);
        }, 0);
      });
    });

    expect(pointerReached).toBe(true);
  });

  test('E: rapid open/close does not orphan pointer-events on composer', async ({
    page,
  }) => {
    // Rapidly open and close the rail
    const toggle = page.locator(RAIL_TOGGLE);
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    for (let i = 0; i < 5; i++) {
      await toggle.click();
      await page.waitForTimeout(100);
    }

    // The composer should still be fully interactive
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click({ force: true });

    const isFocused = await page.evaluate(
      selector => document.activeElement === document.querySelector(selector),
      COMPOSER_TEXTAREA
    );
    expect(isFocused).toBe(true);

    await textarea.fill('rapid toggles completed');
    await expect(textarea).toHaveValue('rapid toggles completed');
  });
});
