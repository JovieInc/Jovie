/**
 * E2E smoke: the production authenticated shell can render the Shell + Chat V1
 * frame when the dev override forces `DESIGN_V1`.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-chat-v1.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Locator, type Page, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });

async function gotoChatRoute(page: Page) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto('/app/chat', {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts && /ERR_EMPTY_RESPONSE|ECONNRESET/i.test(message);

      if (!shouldRetry) {
        throw error;
      }

      await page.waitForTimeout(1000 * attempt);
    }
  }
}

async function forceDesignV1(page: Page) {
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
}

type ShellChatLocators = {
  chatContent: Locator;
  composer: Locator;
  input: Locator;
  shellFrame: Locator;
  shellScroll: Locator;
};

function shellChatFrameLocators(page: Page): ShellChatLocators {
  const shellFrame = page.locator(
    '[data-shell-design="shellChatV1"]:has([data-testid="app-shell-scroll"] [data-testid="chat-content"])'
  );
  const shellScroll = shellFrame.locator('[data-testid="app-shell-scroll"]');
  const chatContent = shellScroll.locator('[data-testid="chat-content"]');
  const composer = chatContent.locator('[data-testid="chat-composer-surface"]');
  const input = composer.locator('[aria-label="Chat message input"]');

  return { chatContent, composer, input, shellFrame, shellScroll };
}

test('chat route renders the Shell V1 app frame when forced on', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);

  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-shell-chat-user');
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  const { chatContent, composer, shellFrame } = shellChatFrameLocators(page);

  await expect(shellFrame).toBeVisible({
    timeout: 30_000,
  });
  await expect(chatContent).toBeVisible({ timeout: 30_000 });
  await expect(composer).toHaveCSS(
    'border-radius',
    /^(?:999px|18px|20px|24px|28px|36px)$/
  );
  await expect(page.locator('.animate-shell-in')).toHaveCount(0);
});

test('chat route picker opens without moving the shell or composer', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-chat-picker-user'
  );
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  const { composer, input, shellScroll } = shellChatFrameLocators(page);
  await expect(composer).toBeVisible({ timeout: 30_000 });

  const beforeBox = await composer.boundingBox();
  const beforeScrollTop = await shellScroll.evaluate(
    element => element.scrollTop
  );

  await input.fill('/');
  await expect(composer).toHaveAttribute('data-surface-mode', 'root');
  await expect(page.locator('[data-testid="slash-command-menu"]')).toBeVisible({
    timeout: 10_000,
  });

  const afterBox = await composer.boundingBox();
  const afterScrollTop = await shellScroll.evaluate(
    element => element.scrollTop
  );

  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  if (beforeBox && afterBox) {
    expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(1);
  }
  expect(afterScrollTop).toBe(beforeScrollTop);
});

test('chat composer clears mobile shell tabs on tablet and phone', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-chat-mobile-user'
  );

  for (const viewport of [
    { label: 'tablet', width: 768, height: 1024 },
    { label: 'phone', width: 390, height: 844 },
    { label: 'small phone', width: 320, height: 568 },
  ] as const) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoChatRoute(page);
    await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

    const { composer } = shellChatFrameLocators(page);
    const mobileTabs = page.getByRole('navigation', {
      name: 'Dashboard tabs',
    });

    await expect(composer).toBeVisible({ timeout: 30_000 });
    await expect(mobileTabs).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => composer.boundingBox(), {
        message: `${viewport.label} composer is measurable`,
        timeout: 30_000,
      })
      .not.toBeNull();
    await expect
      .poll(() => mobileTabs.boundingBox(), {
        message: `${viewport.label} mobile tabs are measurable`,
        timeout: 30_000,
      })
      .not.toBeNull();

    const composerBox = await composer.boundingBox();
    const tabsBox = await mobileTabs.boundingBox();

    expect(composerBox, `${viewport.label} composer is measurable`).not.toBe(
      null
    );
    expect(tabsBox, `${viewport.label} mobile tabs are measurable`).not.toBe(
      null
    );
    if (composerBox && tabsBox) {
      expect(
        composerBox.y + composerBox.height,
        `${viewport.label} composer bottom clears tabs`
      ).toBeLessThanOrEqual(tabsBox.y - 2);
    }
  }
});
