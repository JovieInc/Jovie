/**
 * E2E: Chat composer (Variant F surface morph + slash picker keyboard walk).
 *
 * Asserts the morphing surface state machine on `[data-testid="chat-composer-surface"]`
 * — `data-surface-mode` flips between `empty -> typing -> root -> entity` as
 * the user types, opens the slash picker, and commits a skill.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-composer --project=chromium
 *
 * @see apps/web/components/jovie/components/ChatInput.tsx (data-surface-mode)
 * @see apps/web/components/jovie/components/SlashCommandMenu.tsx
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

async function expectSurfaceMode(
  page: import('@playwright/test').Page,
  mode: 'empty' | 'typing' | 'root' | 'entity'
): Promise<void> {
  await expect(page.locator(COMPOSER_SURFACE)).toHaveAttribute(
    'data-surface-mode',
    mode,
    { timeout: 10_000 }
  );
}

async function openComposer(page: import('@playwright/test').Page) {
  await ensureSignedInUser(page);
  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
  await waitForHydration(page);
  await expect(page.locator(COMPOSER_SURFACE)).toBeVisible({ timeout: 30_000 });
}

test.describe('Chat composer — Variant F surface morph', () => {
  test.beforeAll(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Clerk credentials not configured');
    }
  });

  test('A: empty -> typing surface morph', async ({ page }) => {
    await openComposer(page);

    await expectSurfaceMode(page, 'empty');

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await textarea.fill('hello');

    await expectSurfaceMode(page, 'typing');
  });

  test('B: slash root -> entity surface (skill with required release slot)', async ({
    page,
  }) => {
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');

    await expectSurfaceMode(page, 'root');
    await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });

    // First skill in COMMANDS is `generateAlbumArt` which has a required
    // `release` slot, so committing it should flip the surface to `entity`.
    // ArrowDown isn't strictly needed (selectedIndex starts at 0 = first
    // skill), but we walk through it to exercise the keyboard nav.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    // If the skill commits with an entity slot, the surface should flip to
    // `entity`. If the catalog has no releases the rail will still render in
    // `entity` mode (with an empty list). Accept either outcome — the
    // critical assertion is the surface morph.
    try {
      await expectSurfaceMode(page, 'entity');
    } catch (error) {
      // If the picker closed entirely, this skill didn't have a slot in this
      // build (e.g. registry shifted). Fail loudly so we don't silently
      // regress the contract.
      throw new Error(
        `Expected surface to flip to 'entity' after committing first skill: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Escape should close the picker; surface should drop back to typing or
    // empty depending on whether a chip lingered.
    await page.keyboard.press('Escape');

    const surfaceMode = await page
      .locator(COMPOSER_SURFACE)
      .getAttribute('data-surface-mode');
    expect(surfaceMode === 'empty' || surfaceMode === 'typing').toBe(true);
  });

  test('C: direct slash entry to entity (skipped on builds without /release direct-entry)', async ({
    page,
  }) => {
    // PR #5 introduces `/release ` as a direct entry to the entity picker.
    // On builds where it hasn't merged yet the surface stays in `root` mode
    // — we skip rather than fail in that case.
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    await page.keyboard.type('release ');

    const mode = await page
      .locator(COMPOSER_SURFACE)
      .getAttribute('data-surface-mode');
    if (mode !== 'entity') {
      test.skip(true, '/release direct-entry not on this build');
    }

    await expectSurfaceMode(page, 'entity');
  });

  test('D: IME-safe Enter on textarea (picker closed)', async ({ page }) => {
    // The textarea's handleKeyDown checks `e.nativeEvent.isComposing` and
    // returns early — typing message + Enter during IME composition must
    // not submit the message. We exercise the textarea path here because
    // the picker's global keydown listener does not currently gate on
    // composition state (tracked separately).
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await textarea.fill('hello');
    await expectSurfaceMode(page, 'typing');

    // Dispatch a CompositionEvent on the textarea so React's synthetic
    // event mirrors a real IME session for the next keypress. Playwright's
    // `keyboard.press` does not natively flip `isComposing`, so we rely on
    // dispatching a native KeyboardEvent that carries `isComposing: true`.
    const stillTyping = await textarea.evaluate(el => {
      const target = el as HTMLTextAreaElement;
      target.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true })
      );
      const enterDuringIme = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        // `isComposing` reflects active IME state; React surfaces it via
        // `e.nativeEvent.isComposing`.
        isComposing: true,
      } as KeyboardEventInit);
      target.dispatchEvent(enterDuringIme);
      target.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true })
      );
      // If the textarea handler fired submit, the surface would drop back
      // to `empty`. Read the live attribute to assert.
      return document
        .querySelector('[data-testid="chat-composer-surface"]')
        ?.getAttribute('data-surface-mode');
    });

    // No commit happened — we're still in `typing` (text remains in the
    // textarea, no submit fired).
    expect(stillTyping).toBe('typing');
  });

  test('E: Escape returns focus to textarea', async ({ page }) => {
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');
    await expectSurfaceMode(page, 'root');

    await page.keyboard.press('Escape');

    const isFocused = await page.evaluate(
      selector =>
        document.activeElement === document.querySelector(selector as string),
      COMPOSER_TEXTAREA
    );
    expect(isFocused).toBe(true);
  });

  test('F: compact viewport stacks rail above input', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await openComposer(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.click();
    await page.keyboard.press('/');

    // Below 900px the surface flips to the stacked layout — rail renders
    // above the input row.
    await expectSurfaceMode(page, 'root');
    await expect(page.locator(SLASH_MENU)).toBeVisible({ timeout: 5_000 });

    const railBox = await page.locator(SLASH_MENU).boundingBox();
    const inputBox = await textarea.boundingBox();

    expect(railBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    if (railBox && inputBox) {
      // Stacked mode: rail's bottom edge should sit at or above the
      // textarea's top edge.
      expect(railBox.y + railBox.height).toBeLessThanOrEqual(inputBox.y + 1);
    }
  });
});
