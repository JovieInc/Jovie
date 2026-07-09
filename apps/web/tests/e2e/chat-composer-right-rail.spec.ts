/**
 * E2E: Chat composer × Live Profile right rail interaction matrix (gh-13225).
 *
 * The composer-blocked regression (gh-13221) shipped invisibly because nothing
 * in CI exercised the composer while the profile rail / its kebab menu / the
 * UTM Builder dialog were open. Stacked Radix modal layers (DropdownMenu →
 * Dialog) can race on teardown and leave `pointer-events: none` stuck on
 * <body>, deadening the composer.
 *
 * After every rail/menu/dialog open-close cycle we assert three invariants:
 *   (a) the composer is focusable and accepts typed text,
 *   (b) `getComputedStyle(document.body).pointerEvents !== 'none'`,
 *   (c) `document.elementFromPoint()` at the composer center resolves inside
 *       the composer surface (no invisible interceptor).
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-composer-right-rail --project=chromium
 *
 * @see apps/web/components/molecules/drawer/RightDrawer.tsx (desktop inline vs mobile overlay)
 * @see apps/web/components/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar.tsx
 * @see apps/web/components/features/profile/UtmBuilderDialog.tsx
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ensureSignedInUser,
  hasClerkCredentials,
} from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

// Case-insensitive accessible-name match — the source label is
// 'Chat Message Input' (ChatInput.tsx); getByLabel keeps this resilient to
// casing churn that has already gone stale in older specs.
const COMPOSER_LABEL = /chat message input/i;
const RAIL_TOGGLE = '[data-testid="artist-profile-rail-toggle"]';
const KEBAB_TRIGGER = 'button[aria-label="Profile Actions"]';
const EDIT_PROFILE_BUTTON = 'button:has-text("Edit Profile")';
const DONE_BUTTON = 'button[aria-label="Done"]';
const UTM_MENU_ITEM = '[role="menuitem"]:has-text("UTM Builder")';
const MENU_CONTENT = '[data-menu-surface="toolbar"]';

function composer(page: Page) {
  return page.getByLabel(COMPOSER_LABEL).last();
}

/** Invariant (b): the stacked-layer teardown never leaves body inert. */
async function expectBodyInteractive(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => globalThis.getComputedStyle(document.body).pointerEvents
        ),
      { timeout: 5_000 }
    )
    .not.toBe('none');
}

/** Invariants (a) + (c): composer focusable, typeable, and hit-testable. */
async function expectComposerUsable(page: Page, marker: string) {
  const input = composer(page);
  await expect(input).toBeVisible({ timeout: 10_000 });

  // (c) elementFromPoint at composer center resolves to (or inside) the input.
  const hit = await input.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return target ? element === target || element.contains(target) : false;
  });
  expect(hit, 'elementFromPoint at composer center must hit the input').toBe(
    true
  );

  // (a) focus + type real text.
  await input.click();
  await expect(input).toBeFocused();
  await input.fill('');
  await input.pressSequentially(marker, { delay: 10 });
  await expect(input).toHaveValue(new RegExp(marker));
  await input.fill('');
}

async function expectInvariants(page: Page, marker: string) {
  await expectBodyInteractive(page);
  await expectComposerUsable(page, marker);
}

async function openChatWithComposer(page: Page) {
  await ensureSignedInUser(page);
  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
  await waitForHydration(page);
  await expect(composer(page)).toBeVisible({ timeout: 30_000 });
}

async function openRail(page: Page) {
  const toggle = page.locator(RAIL_TOGGLE);
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  }
  // The bento view renders the kebab once preview data hydrates.
  await expect(page.locator(KEBAB_TRIGGER)).toBeVisible({ timeout: 20_000 });
}

async function closeRail(page: Page) {
  const toggle = page.locator(RAIL_TOGGLE);
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed === 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
}

async function openKebabMenu(page: Page) {
  await page.locator(KEBAB_TRIGGER).click();
  await expect(page.locator(MENU_CONTENT).last()).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('Chat composer × profile rail interaction matrix', () => {
  test.beforeEach(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Clerk credentials not configured');
    }
  });

  test('rail open → composer stays usable', async ({ page }) => {
    await openChatWithComposer(page);
    await openRail(page);
    await expectInvariants(page, 'rail-open');
  });

  test('kebab menu open/close cycles keep composer usable', async ({
    page,
  }) => {
    await openChatWithComposer(page);
    await openRail(page);

    // Close via outside-click.
    await openKebabMenu(page);
    await page.mouse.click(20, 200);
    await expect(page.locator(MENU_CONTENT)).toHaveCount(0);
    await expectInvariants(page, 'menu-outside-click');

    // Close via ESC.
    await openKebabMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU_CONTENT)).toHaveCount(0);
    await expectInvariants(page, 'menu-escape');
  });

  test('UTM Builder dialog open/close never deadens the composer', async ({
    page,
  }) => {
    await openChatWithComposer(page);
    await openRail(page);

    // Open the dialog from the kebab menu (the stacked-layer path, gh-13221).
    await openKebabMenu(page);
    await page.locator(UTM_MENU_ITEM).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'UTM Builder' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Dialog traps focus while open; ESC closes the dialog only — the rail
    // (and its kebab) must survive because RightDrawer's Escape handler
    // defers to open modal dialogs.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(KEBAB_TRIGGER)).toBeVisible();
    await expectInvariants(page, 'dialog-escape');

    // Re-open and close via the Copy link path.
    await openKebabMenu(page);
    await page.locator(UTM_MENU_ITEM).click();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('textbox').first().fill('instagram');
    await dialog.getByRole('button', { name: /copy/i }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expectInvariants(page, 'dialog-copy-close');
  });

  test('edit mode round-trip and rail close keep composer usable end-to-end', async ({
    page,
  }) => {
    await openChatWithComposer(page);
    await openRail(page);

    // Flip to edit mode and back.
    await page.locator(EDIT_PROFILE_BUTTON).click();
    await expect(page.locator(DONE_BUTTON)).toBeVisible({ timeout: 10_000 });
    await expectInvariants(page, 'edit-mode');
    await page.locator(DONE_BUTTON).click();
    await expect(page.locator(EDIT_PROFILE_BUTTON)).toBeVisible({
      timeout: 10_000,
    });
    await expectInvariants(page, 'view-mode-return');

    // Close the rail — composer regains full usability.
    await closeRail(page);
    await expectInvariants(page, 'rail-closed');
  });

  test('sub-lg overlay branch recovers the composer on rail close', async ({
    page,
  }) => {
    // Just below the lg breakpoint the RightDrawer renders as a full-screen
    // overlay (`fixed inset-0 z-50`) that legitimately covers the composer —
    // assert it fully recovers once closed.
    await page.setViewportSize({ width: 1023, height: 800 });
    await openChatWithComposer(page);

    const toggle = page.locator(RAIL_TOGGLE);
    test.skip(
      !(await toggle.isVisible().catch(() => false)),
      'Rail toggle not rendered at this viewport'
    );

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expectInvariants(page, 'mobile-overlay-recovered');
  });
});
