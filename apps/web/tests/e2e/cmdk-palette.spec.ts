/**
 * E2E: Command palette (Cmd+K).
 *
 * Tests assert the minimal Cmd+K contract — open via Meta+K, search, Enter
 * to navigate, Esc to close. PR #4 (cmd+k unification) is in flight; the
 * future shared palette will preserve this contract, so these assertions
 * continue to pass once #4 lands.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test cmdk-palette --project=chromium
 *
 * @see apps/web/components/organisms/CommandPalette.tsx
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const PALETTE_INPUT = 'input[placeholder="Jump to a page, thread, or action…"]';

test.describe('Command palette — Cmd+K contract', () => {
  test.beforeAll(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Clerk credentials not configured');
    }
  });

  test('Meta+K opens, search + Enter navigates, Esc closes', async ({
    page,
  }) => {
    await ensureSignedInUser(page);
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD_RELEASES, {
      timeout: 60_000,
    });
    await waitForHydration(page);

    // Move focus off any auto-focused form element. The palette's global
    // Cmd+K listener bails when the active element is INPUT/TEXTAREA/SELECT
    // (see lib/utils/keyboard.ts isFormElement), so we click the page body
    // before pressing the hotkey.
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    // Open the palette via the global hotkey.
    await page.keyboard.press('Meta+k');
    const paletteInput = page.locator(PALETTE_INPUT);
    await expect(paletteInput).toBeVisible({ timeout: 10_000 });
    await expect(paletteInput).toBeFocused();

    // Type a query that matches the Releases nav item.
    await paletteInput.fill('Releases');

    // Verify at least one cmdk option surfaces. cmdk renders items with
    // `cmdk-item` data attributes; prefer that to a brittle text selector.
    const matches = page.locator('[cmdk-item]');
    await expect(matches.first()).toBeVisible({ timeout: 5_000 });

    // Enter commits the highlighted item — should navigate to releases.
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/app\/dashboard\/releases/, { timeout: 15_000 });

    // Move focus back to the body so the next Meta+K isn't swallowed by an
    // auto-focused form element on the destination route.
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    // Reopen palette to confirm the trigger still works after navigation.
    await page.keyboard.press('Meta+k');
    await expect(page.locator(PALETTE_INPUT)).toBeVisible({ timeout: 10_000 });

    // Escape closes the palette.
    await page.keyboard.press('Escape');
    await expect(page.locator(PALETTE_INPUT)).toBeHidden({ timeout: 5_000 });
  });
});
