/**
 * E2E: Visual regression for the Variant F chat composer.
 *
 * Captures the composer surface (`[data-testid="chat-composer-surface"]`)
 * in three canonical states: empty, typing, and root picker open.
 *
 * Baselines live in `tests/e2e/__snapshots__/chat-visual.spec.ts/` (per the
 * `snapshotPathTemplate` in `playwright.config.ts`). Generate / refresh
 * with `--update-snapshots`.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-visual --project=chromium
 *
 * @see apps/web/playwright.config.ts (snapshot config)
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';
const SLASH_MENU = '[data-testid="slash-command-menu"]';

function getVisibleComposerSurface(page: Page) {
  return page.locator(COMPOSER_SURFACE).filter({ visible: true });
}

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
    await expect(getVisibleComposerSurface(page)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('empty state', async ({ page }) => {
    const surface = getVisibleComposerSurface(page);
    await expect(surface).toHaveAttribute('data-surface-mode', 'empty', {
      timeout: 5_000,
    });
    await expect(surface).toHaveScreenshot('composer-empty.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('typing state', async ({ page }) => {
    const surface = getVisibleComposerSurface(page);
    await surface.locator(COMPOSER_TEXTAREA).fill('Hello');
    await expect(surface).toHaveAttribute('data-surface-mode', 'typing', {
      timeout: 5_000,
    });
    await expect(surface).toHaveScreenshot('composer-typing.png', {
      maxDiffPixelRatio: 0.03,
    });
  });

  test('root picker', async ({ page }) => {
    const surface = getVisibleComposerSurface(page);
    const textarea = surface.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    await expect(surface).toHaveAttribute('data-surface-mode', 'root', {
      timeout: 5_000,
    });
    await expect(surface.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });
    await expect(surface).toHaveScreenshot('composer-root.png', {
      maxDiffPixelRatio: 0.03,
    });
  });
});
