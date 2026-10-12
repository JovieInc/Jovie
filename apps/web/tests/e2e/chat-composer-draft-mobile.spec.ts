/**
 * E2E (mobile): composer-draft visibility and interaction on iOS-class
 * viewports.
 *
 * Asserts the chat composer keeps the draft visible and tappable on a
 * phone viewport in both states — empty (fresh thread) and populated
 * (draft text retained) — so regressions that hide the composer or block
 * text entry on iOS are caught before they ship.
 *
 * Runs in the mobile parity lane (MOBILE_SMOKE_SPECS →
 * playwright.config.smoke.mobile.ts) and skips cleanly without
 * E2E_USE_TEST_AUTH_BYPASS=1.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web run e2e:smoke:mobile
 *
 * @see apps/web/components/jovie/components/ChatInput.tsx
 * @see apps/web/lib/chat/composer-draft-store.ts
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

// iPhone 13/14 logical viewport — see tests/e2e/utils/mobile-profile-viewports.ts.
const IOS_VIEWPORT = { width: 390, height: 844 } as const;

const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';
const DRAFT_TEXT = 'follow up on the release rollout plan';

test.use({
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: async ({ browserName }, provideMobile) => {
    await provideMobile(browserName !== 'firefox');
  },
  storageState: { cookies: [], origins: [] },
  viewport: IOS_VIEWPORT,
});

function composerSurface(page: Page) {
  return page.locator(COMPOSER_SURFACE).last();
}

function composerTextarea(page: Page) {
  return page.locator(COMPOSER_TEXTAREA).last();
}

async function openChatComposer(page: Page) {
  await page.setViewportSize(IOS_VIEWPORT);
  await ensureSignedInUser(page);
  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
  await waitForHydration(page);
  await expect(composerSurface(page)).toBeVisible({ timeout: 30_000 });
}

async function expectInsideViewport(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'composer draft should have a layout box').not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(IOS_VIEWPORT.width);
  expect(box.y + box.height).toBeLessThanOrEqual(IOS_VIEWPORT.height);
}

test.describe('Chat composer draft — iOS visibility', () => {
  test.beforeAll(() => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Test auth bypass not configured');
    }
  });

  test('empty state: composer draft is visible and accepts text entry', async ({
    page,
  }) => {
    await openChatComposer(page);

    const textarea = composerTextarea(page);
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await expectInsideViewport(textarea);
    await expectInsideViewport(composerSurface(page));

    await textarea.tap();
    await expect(textarea).toBeFocused({ timeout: 10_000 });

    await textarea.fill(DRAFT_TEXT);
    await expect(textarea).toHaveValue(DRAFT_TEXT);
    await expect(composerSurface(page)).toHaveAttribute(
      'data-surface-mode',
      'typing',
      { timeout: 10_000 }
    );
  });

  test('populated state: draft stays visible and editable after blur', async ({
    page,
  }) => {
    await openChatComposer(page);

    const textarea = composerTextarea(page);
    await textarea.tap();
    await textarea.fill(DRAFT_TEXT);
    await expect(textarea).toHaveValue(DRAFT_TEXT);

    // Blur the composer, then tap it back — the retained draft must stay
    // visible inside the iOS viewport and accept more text.
    await page
      .locator('main')
      .first()
      .tap({ position: { x: 8, y: 8 } });
    await expectInsideViewport(textarea);

    await textarea.tap();
    await expect(textarea).toBeFocused({ timeout: 10_000 });
    await expect(textarea).toHaveValue(DRAFT_TEXT);

    await textarea.fill(`${DRAFT_TEXT} tomorrow`);
    await expect(textarea).toHaveValue(`${DRAFT_TEXT} tomorrow`);
    await expectInsideViewport(textarea);
  });
});
