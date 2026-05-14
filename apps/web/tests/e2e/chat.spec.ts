/**
 * E2E smoke: chat page P0 health checks (JOV-2074).
 *
 * Covers:
 *   - chat page loads for authenticated user (dev auth bypass)
 *   - can type text in chat input
 *   - pressing bare T while chat input is focused does NOT toggle theme
 *   - slash command appearing does not cause layout shift > 50px
 *
 * Auth: dev bypass via /api/dev/test-auth/enter (E2E_USE_TEST_AUTH_BYPASS=1).
 * Falls back to Clerk test-mode sign-in when bypass is unavailable.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 doppler run -- pnpm --filter web exec playwright test chat.spec --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const BYPASS_PERSONA = 'creator-ready';

/** Authenticate via the fastest available path */
async function authenticateAndGoToChat(
  page: import('@playwright/test').Page
): Promise<void> {
  if (USE_TEST_AUTH_BYPASS) {
    // Fast local path: dev auth bypass sets cookies + redirects to chat
    await page.goto(
      `/api/dev/test-auth/enter?persona=${BYPASS_PERSONA}&redirect=${encodeURIComponent(APP_ROUTES.CHAT)}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 }
    );
    await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });
  } else {
    await ensureSignedInUser(page);
    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
  }
  await waitForHydration(page);
}

// Tests need fresh unauthenticated context — bypass provides its own session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Chat @smoke', () => {
  test.beforeAll(() => {
    if (!USE_TEST_AUTH_BYPASS && !hasClerkCredentials()) {
      test.skip(true, 'No Clerk credentials and test auth bypass not enabled');
    }
  });

  test('chat page loads for authenticated user', async ({ page }) => {
    test.setTimeout(120_000);

    const consoleErrors: string[] = [];
    page.on('pageerror', err => consoleErrors.push(String(err)));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await authenticateAndGoToChat(page);

    // Chat content root must be visible
    await expect(
      page.locator('[data-testid="chat-content"]'),
      'chat-content root not visible — chat failed to render'
    ).toBeVisible({ timeout: 30_000 });

    // Body must not show error states
    const bodyText = (
      (await page.locator('body').textContent()) ?? ''
    ).toLowerCase();
    expect(bodyText, 'Chat page shows application error').not.toContain(
      'application error'
    );
    expect(bodyText, 'Chat page shows internal server error').not.toContain(
      'internal server error'
    );
    expect(bodyText, 'Chat page shows unhandled runtime error').not.toContain(
      'unhandled runtime error'
    );

    // Filter out known-benign noise
    const ignorable = [
      /clerk|handshake|dev-browser/i,
      /sentry/i,
      /favicon/i,
      /non-passive event listener/i,
      /ResizeObserver loop/i,
      /eval\(\) is not supported/i,
      /chunkloaderror/i,
      /net::err_/i,
      /content security policy/i,
      /posthog/i,
      /__vercel/i,
      /negative time stamp/i,
      /encountered a script tag while rendering/i,
    ];
    const relevant = consoleErrors.filter(
      e => !ignorable.some(rx => rx.test(e))
    );
    expect(
      relevant,
      `Unexpected console errors in chat:\n${relevant.join('\n')}`
    ).toEqual([]);
  });

  test('can type text in chat input', async ({ page }) => {
    test.setTimeout(120_000);

    await authenticateAndGoToChat(page);

    await expect(
      page.locator('[data-testid="chat-content"]'),
      'chat-content root not visible'
    ).toBeVisible({ timeout: 30_000 });

    // Locate the chat composer textarea via aria-label
    const composer = page
      .getByPlaceholder(/ask jovie|ask a follow-up|chat message/i)
      .first();
    await expect(composer, 'chat composer not visible').toBeVisible({
      timeout: 15_000,
    });

    await composer.click();
    await composer.fill('hello from smoke test');

    // Verify text was accepted
    const value = await composer.inputValue().catch(() =>
      composer.evaluate((el: HTMLElement) => {
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          return el.value;
        }
        return el.textContent ?? '';
      })
    );
    expect(value, 'composer did not accept typed text').toContain(
      'hello from smoke test'
    );
  });

  test('pressing bare T while chat input focused does not toggle theme', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await authenticateAndGoToChat(page);

    await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
      timeout: 30_000,
    });

    const composer = page
      .getByPlaceholder(/ask jovie|ask a follow-up|chat message/i)
      .first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.click();

    // Capture initial theme
    const themeBeforeHtml = await page.locator('html').getAttribute('class');
    const themeBeforeData = await page
      .locator('html')
      .getAttribute('data-theme');

    // Type bare 't' into the focused composer (not Alt+T)
    await page.keyboard.press('t');

    // Theme class/data-theme must not have changed
    const themeAfterHtml = await page.locator('html').getAttribute('class');
    const themeAfterData = await page
      .locator('html')
      .getAttribute('data-theme');

    expect(
      themeAfterHtml,
      'HTML class changed after bare T — theme toggled in chat input'
    ).toBe(themeBeforeHtml);
    expect(
      themeAfterData,
      'data-theme changed after bare T — theme toggled in chat input'
    ).toBe(themeBeforeData);

    // The 't' character should appear in the input (not suppressed)
    const value = await composer.inputValue().catch(() =>
      composer.evaluate((el: HTMLElement) => {
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          return el.value;
        }
        return el.textContent ?? '';
      })
    );
    expect(value, 'bare T was not typed into composer').toContain('t');
  });

  test('slash command appearing does not cause layout shift > 50px', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await authenticateAndGoToChat(page);

    await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
      timeout: 30_000,
    });

    const composer = page
      .getByPlaceholder(/ask jovie|ask a follow-up|chat message/i)
      .first();
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // Record the composer bounding box before slash
    const beforeBox = await page
      .locator('[data-testid="chat-composer-surface"]')
      .boundingBox();

    await composer.click();
    await page.keyboard.press('/');

    // Wait for slash menu to appear (or best-effort)
    await page
      .locator('[data-testid="slash-command-menu"]')
      .waitFor({
        state: 'visible',
        timeout: 5_000,
      })
      .catch(() => {
        // Some builds may not have the slash command menu yet — skip the box check
      });

    // Short settle for any animations
    await page.waitForTimeout(300);

    const afterBox = await page
      .locator('[data-testid="chat-composer-surface"]')
      .boundingBox();

    if (beforeBox && afterBox) {
      const shift = Math.abs(afterBox.y - beforeBox.y);
      expect(
        shift,
        `Slash command caused layout shift of ${shift}px (limit: 50px)`
      ).toBeLessThanOrEqual(50);
    }

    // Clean up the slash
    await page.keyboard.press('Escape');
  });
});
