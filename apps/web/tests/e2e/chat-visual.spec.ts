/**
 * E2E: Visual regression for the Variant F chat composer.
 *
 * Captures the composer surface (`[data-testid="chat-composer-surface"]`)
 * in three canonical states: empty, typing, and root picker open.
 *
 * Baselines live in `tests/e2e/chat-visual.spec.ts-snapshots/` (per the
 * `snapshotPathTemplate` in `playwright.config.ts`). Generate / refresh
 * with `--update-snapshots`.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-visual --project=chromium
 *
 * @see apps/web/playwright.config.ts (snapshot config)
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat message input"]';
const SLASH_MENU = '[data-testid="slash-command-menu"]';

test.describe('Chat composer visual regression', () => {
  test.beforeAll(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Clerk credentials not configured');
    }
  });

  test.beforeEach(async ({ page }) => {
    await ensureSignedInUser(page);
    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
    await waitForHydration(page);
    await expect(page.locator(COMPOSER_SURFACE)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('empty state', async ({ page }) => {
    const surface = page.locator(COMPOSER_SURFACE);
    await expect(surface).toHaveAttribute('data-surface-mode', 'empty', {
      timeout: 5_000,
    });
    await expect(surface).toHaveScreenshot('composer-empty.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('typing state', async ({ page }) => {
    await page.locator(COMPOSER_TEXTAREA).fill('Hello');
    const surface = page.locator(COMPOSER_SURFACE);
    await expect(surface).toHaveAttribute('data-surface-mode', 'typing', {
      timeout: 5_000,
    });
    await expect(surface).toHaveScreenshot('composer-typing.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('root picker', async ({ page }) => {
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    const surface = page.locator(COMPOSER_SURFACE);
    await expect(surface).toHaveAttribute('data-surface-mode', 'root', {
      timeout: 5_000,
    });
    await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });
    await expect(surface).toHaveScreenshot('composer-root.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});
