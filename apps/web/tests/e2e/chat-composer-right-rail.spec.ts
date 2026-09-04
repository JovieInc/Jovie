/**
 * E2E: chat composer × right-rail interaction matrix (JOV-3969).
 *
 * Regression-proofs the chat composer against overlay/focus leaks from the
 * right profile rail. Every step asserts three invariants:
 *   (a) the composer is focusable and accepts typed text
 *   (b) `getComputedStyle(document.body).pointerEvents !== 'none'`
 *   (c) `document.elementFromPoint()` at the composer center hits the composer
 *       (no invisible interceptor above it)
 *
 * Matrix (current chat rail surface):
 *   1. Live Profile rail open → invariants.
 *   2. Close rail via header toggle → invariants. Reopen + close via the `]`
 *      keyboard shortcut → invariants.
 *   3. In-rail "Copy profile link" action → invariants.
 *   4. Close rail → composer regains full width → type + submit end-to-end.
 *   5. Sub-lg viewport: mobile overlay branch (`fixed inset-0 z-50` in
 *      RightDrawer) legitimately covers the composer → recovers on close.
 *
 * Environment notes:
 * - The chat preview panel is disabled under E2E unless the URL carries
 *   `?panel=profile` (ChatPageClient.tsx), which also auto-opens the rail —
 *   so every test starts from the open state and exercises close/reopen
 *   explicitly.
 * - Reconciliation vs the Linear issue: the issue enumerated a kebab menu, a
 *   UTM Builder dialog, and an Edit-mode flip inside the chat rail. Those
 *   affordances are not reachable in the current chat rail: the rail renders
 *   `ProfileContactSidebar` in read-only view mode (the editing rail is
 *   retired from chat — see the `onEditProfile` legacy callback in
 *   ProfileContactSidebarSections.tsx), and `UtmBuilderDialog` has no
 *   production importer. This spec covers every panel/copy state the rail
 *   actually exposes; the stale `Profile Actions` → `UTM Builder` path in
 *   chat-rail-composer-interaction.spec.ts test F predates that retirement.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test tests/e2e/chat-composer-right-rail.spec.ts --project=chromium
 *
 * @see apps/web/components/molecules/drawer/RightDrawer.tsx (desktop inline vs mobile overlay)
 * @see apps/web/components/features/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar.tsx
 */

import { expect, type Page, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { gotoAuthenticatedChatRoute } from './utils/smoke-test-utils';

const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';
const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const RAIL_TOGGLE = '[data-testid="artist-profile-rail-toggle"]';
const APP_SHELL_FRAME = '[data-app-shell-frame="true"]';
const PROFILE_RAIL = '[data-testid="profile-contact-sidebar"]';
const RAIL_SUMMARY = '[data-testid="profile-preview-summary"]';
const CHAT_WITH_PROFILE_PANEL = '/app/chat?panel=profile';
const COPY_PROFILE_LINK = 'Copy profile link';
const RAIL_SHORTCUT = ']';
/** lg breakpoint is 1024px; one px below selects RightDrawer's mobile overlay branch. */
const SUB_LG_VIEWPORT = { width: 1023, height: 800 } as const;

test.use({ storageState: { cookies: [], origins: [] } });

async function expectRailOpen(page: Page) {
  await expect(page.locator(PROFILE_RAIL)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(RAIL_SUMMARY)).toBeVisible({ timeout: 15_000 });
}

async function expectRailClosed(page: Page) {
  // The host unmounts the preview rail when the panel closes, and the desktop
  // RightDrawer also collapses to zero width + `invisible` — both count as hidden.
  await expect(page.locator(PROFILE_RAIL)).toBeHidden({ timeout: 15_000 });
}

/** Move focus out of any editable surface so the bare `]` shortcut is not typed as text. */
async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function readComposerHitTest(page: Page) {
  return page
    .locator(COMPOSER_TEXTAREA)
    .evaluate((element, surfaceSelector) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      if (!hit) return { hitComposer: false, hitDescription: 'null' };
      const hitComposer =
        hit === element ||
        element.contains(hit) ||
        Boolean(hit.closest(surfaceSelector));
      const tag = hit.tagName.toLowerCase();
      const testId = hit.getAttribute('data-testid');
      const role = hit.getAttribute('role');
      return {
        hitComposer,
        hitDescription: `${tag}${testId ? `[data-testid="${testId}"]` : ''}${role ? `[role="${role}"]` : ''}`,
      };
    }, COMPOSER_SURFACE);
}

/**
 * The three JOV-3969 invariants, asserted at a single point in the matrix.
 * `step` labels the failure message so a red run identifies the broken state.
 */
async function assertComposerInteractive(page: Page, step: string) {
  const textarea = page.locator(COMPOSER_TEXTAREA);
  await expect(textarea).toBeVisible({ timeout: 20_000 });

  // (b) No global pointer-events lock leaked onto the body.
  const bodyPointerEvents = await page.evaluate(
    () => getComputedStyle(document.body).pointerEvents
  );
  expect(bodyPointerEvents, `${step}: body pointer-events is locked`).not.toBe(
    'none'
  );

  // (c) No invisible interceptor above the composer input.
  const hit = await readComposerHitTest(page);
  expect(
    hit.hitComposer,
    `${step}: elementFromPoint at composer center hit ${hit.hitDescription} instead of the composer`
  ).toBe(true);

  // (a) Composer is focusable and accepts typed text. Playwright's click also
  // auto-waits on the hit target, reinforcing (c).
  await textarea.click();
  await expect(textarea).toBeFocused();
  const probe = `probe ${step}`;
  await textarea.pressSequentially(probe);
  await expect(textarea).toHaveValue(probe);
  await textarea.clear();
  await expect(textarea).toHaveValue('');
}

test.describe('chat composer × right-rail interaction matrix', () => {
  test.beforeAll(() => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'Requires E2E_USE_TEST_AUTH_BYPASS=1'
    );
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);

    await setTestAuthBypassSession(page, 'creator-ready');
    // `?panel=profile` enables the preview panel under E2E and auto-opens it.
    await gotoAuthenticatedChatRoute(page, { path: CHAT_WITH_PROFILE_PANEL });

    // Wait for the app shell to be fully rendered
    await expect(page.locator(APP_SHELL_FRAME)).toBeVisible({
      timeout: 30_000,
    });

    // Wait for the composer to be interactive
    await expect(page.locator(COMPOSER_TEXTAREA)).toBeVisible({
      timeout: 20_000,
    });

    // The rail auto-opens with the panel param
    await expectRailOpen(page);
  });

  test('1: open Live Profile rail keeps the composer interactive', async ({
    page,
  }) => {
    await assertComposerInteractive(page, 'rail open');
  });

  test('2: rail close cycles (toggle + keyboard shortcut) keep the composer interactive', async ({
    page,
  }) => {
    await assertComposerInteractive(page, 'rail open');

    // Close via the header toggle.
    await page.locator(RAIL_TOGGLE).click();
    await expectRailClosed(page);
    await assertComposerInteractive(page, 'rail closed via toggle');

    // Reopen and close via the bare `]` keyboard shortcut. Focus must leave
    // the composer first, otherwise `]` is typed as text.
    await blurActiveElement(page);
    await page.keyboard.press(RAIL_SHORTCUT);
    await expectRailOpen(page);
    await assertComposerInteractive(page, 'rail reopened via shortcut');

    await blurActiveElement(page);
    await page.keyboard.press(RAIL_SHORTCUT);
    await expectRailClosed(page);
    await assertComposerInteractive(page, 'rail closed via shortcut');
  });

  test('3: in-rail Copy profile link action keeps the composer interactive', async ({
    page,
  }) => {
    // Clipboard permissions are Chromium-only; other projects rely on the
    // app's execCommand fallback.
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => {
        /* non-Chromium project — clipboard API unavailable */
      });

    const copyButton = page.getByRole('button', { name: COPY_PROFILE_LINK });
    await expect(copyButton).toBeVisible({ timeout: 15_000 });
    await copyButton.click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible({
      timeout: 10_000,
    });

    await assertComposerInteractive(page, 'after copy profile link');
  });

  test('4: closing the rail returns composer full width and a message submits end-to-end', async ({
    page,
  }) => {
    const textarea = page.locator(COMPOSER_TEXTAREA);

    const openBox = await textarea.boundingBox();
    expect(openBox).not.toBeNull();

    await page.locator(RAIL_TOGGLE).click();
    await expectRailClosed(page);

    // The composer must reclaim horizontal space after close. The composer is
    // max-width clamped, so the delta is smaller than the full rail width —
    // assert a strictly positive reclaim rather than a fixed pixel budget.
    await expect
      .poll(async () => (await textarea.boundingBox())?.width ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThan((openBox?.width ?? 0) + 1);

    // Type + submit a message end-to-end: the composer clears on submit and
    // the user message renders in the thread.
    const message = `e2e rail matrix ${Date.now().toString(36)}`;
    await textarea.click();
    await textarea.pressSequentially(message);
    await page.keyboard.press('Enter');

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText(message).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('5: sub-lg mobile overlay legitimately covers the composer and recovers on close', async ({
    page,
  }) => {
    await page.setViewportSize(SUB_LG_VIEWPORT);

    // Mobile branch: the rail is a modal overlay dialog.
    await expect(page.locator(PROFILE_RAIL)).toHaveAttribute('role', 'dialog');
    await expect(page.locator(PROFILE_RAIL)).toHaveAttribute(
      'aria-modal',
      'true'
    );

    // The composer is legitimately covered while the overlay is open.
    await expect
      .poll(async () => (await readComposerHitTest(page)).hitComposer, {
        timeout: 10_000,
      })
      .toBe(false);

    // Close via the `]` shortcut (the overlay covers the header toggle).
    // Focus lives inside the drawer on open — blur first so `]` is not typed
    // into an editable element.
    await blurActiveElement(page);
    await page.keyboard.press(RAIL_SHORTCUT);
    await expectRailClosed(page);

    // Body scroll lock must be released along with the overlay.
    await expect
      .poll(async () => page.evaluate(() => document.body.style.overflow), {
        timeout: 10_000,
      })
      .not.toBe('hidden');

    await assertComposerInteractive(page, 'mobile overlay closed');
  });
});
