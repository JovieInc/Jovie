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
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });

const FLYOUT_CONVERSATION_ID = 'conv-flyout-layering';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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

async function gotoChatConversation(page: Page, conversationId: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(`/app/chat/${conversationId}`, {
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

function toolEvent(): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: 'tool-import-bio',
    toolName: 'writeWorldClassBio',
    state: 'succeeded',
    input: { source: 'timwhite.co' },
    output: {
      success: true,
      summary: 'Completed',
    },
    summary: 'Completed',
    uiHint: 'status',
  };
}

async function mockFlyoutConversation(page: Page) {
  const historicalMessages = Array.from({ length: 8 }, (_, index) => {
    const role = index % 2 === 0 ? 'assistant' : 'user';
    return {
      id: `history-${index}`,
      role,
      content:
        role === 'assistant'
          ? `Earlier assistant context ${index + 1}`
          : `Earlier user context ${index + 1}`,
      toolCalls: null,
      clientMessageId: role === 'user' ? `client-history-${index}` : null,
      turnId: `turn-history-${index}`,
      createdAt: `2026-05-24T07:${String(40 + index).padStart(2, '0')}:00.000Z`,
    };
  });

  await page.route('**/api/chat/capabilities**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tools: {} }),
    })
  );

  await page.route('**/api/chat/conversations?*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversations: [
          {
            id: FLYOUT_CONVERSATION_ID,
            title: 'Flyout layering',
            createdAt: '2026-05-24T07:50:00.000Z',
            updatedAt: '2026-05-24T07:55:00.000Z',
          },
        ],
      }),
    })
  );

  await page.route(
    `**/api/chat/conversations/${FLYOUT_CONVERSATION_ID}`,
    route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversation: {
            id: FLYOUT_CONVERSATION_ID,
            title: 'Flyout layering',
            createdAt: '2026-05-24T07:50:00.000Z',
            updatedAt: '2026-05-24T07:55:00.000Z',
          },
          messages: [
            ...historicalMessages,
            {
              id: 'assistant-intro',
              role: 'assistant',
              content:
                'Hey Tim. I can help with your profile, releases, promotion strategy, playlist pitches, and analytics.',
              toolCalls: null,
              clientMessageId: null,
              turnId: 'turn-intro',
              createdAt: '2026-05-24T07:50:00.000Z',
            },
            {
              id: 'user-import-bio',
              role: 'user',
              content: 'pull my bio from timwhite.co',
              toolCalls: null,
              clientMessageId: 'client-import-bio',
              turnId: 'turn-import-bio',
              createdAt: '2026-05-24T07:51:00.000Z',
            },
            {
              id: 'assistant-tool',
              role: 'assistant',
              content: '',
              toolCalls: [toolEvent()],
              clientMessageId: null,
              turnId: 'turn-import-bio',
              createdAt: '2026-05-24T07:51:20.000Z',
            },
            {
              id: 'user-bio-question',
              role: 'user',
              content: 'whats my bio',
              toolCalls: null,
              clientMessageId: 'client-bio-question',
              turnId: 'turn-bio-question',
              createdAt: '2026-05-24T07:52:00.000Z',
            },
            {
              id: 'assistant-bio-candidate',
              role: 'assistant',
              content:
                'Your bio is currently not set. I found a candidate from your website and can update your profile after you confirm it.',
              toolCalls: null,
              clientMessageId: null,
              turnId: 'turn-bio-question',
              createdAt: '2026-05-24T07:52:20.000Z',
            },
          ],
          hasMore: false,
        }),
      })
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

function boxesOverlap(a: Box, b: Box, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function expectBoxInsideViewport(
  box: Box | null,
  viewport: { width: number; height: number } | null
) {
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function assertSlashMenuClearsThreadContent(page: Page) {
  const slashMenu = page.locator('[data-testid="slash-command-menu"]').last();
  await expect(slashMenu).toBeVisible({ timeout: 10_000 });

  const menuBox = await slashMenu.boundingBox();
  expectBoxInsideViewport(menuBox, page.viewportSize());
  if (!menuBox) return;

  const protectedTargets = [
    page.getByTestId('chat-message-reply').filter({
      hasText: 'Your bio is currently not set',
    }),
    page.getByTestId('tool-status-row').filter({
      hasText: 'Bio ready',
    }),
    page.getByTestId('chat-user-bubble').filter({
      hasText: 'whats my bio',
    }),
  ];

  for (const target of protectedTargets) {
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();
    if (targetBox) {
      expect(boxesOverlap(menuBox, targetBox, 4)).toBe(false);
    }
  }
}

test('chat route renders the Shell V1 app frame when forced on', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; this route needs a bypassed Clerk session.
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
  // Skip outside the explicit dev-auth E2E lane; picker geometry needs a bypassed Clerk session.
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

test('chat route slash picker clears active transcript content in populated threads', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; populated thread fixtures need a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await mockFlyoutConversation(page);
  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-chat-flyout-user'
  );

  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: 'short desktop', width: 1280, height: 720 },
  ] as const) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoChatConversation(page, FLYOUT_CONVERSATION_ID);
    await page.waitForURL(new RegExp(`/app/chat/${FLYOUT_CONVERSATION_ID}$`), {
      timeout: 60_000,
    });

    const { composer, input } = shellChatFrameLocators(page);
    await expect(composer).toBeVisible({ timeout: 30_000 });

    const latestAssistantReply = page.getByTestId('chat-message-reply').filter({
      hasText: 'Your bio is currently not set',
    });
    await latestAssistantReply.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(latestAssistantReply).toBeVisible({ timeout: 30_000 });

    const beforeBox = await composer.boundingBox();
    await input.fill('/t');
    await expect(composer).toHaveAttribute('data-surface-mode', 'root');
    await assertSlashMenuClearsThreadContent(page);

    await input.fill('/tak');
    await assertSlashMenuClearsThreadContent(page);

    const afterBox = await composer.boundingBox();
    expect(beforeBox, `${viewport.label} composer before box`).not.toBeNull();
    expect(afterBox, `${viewport.label} composer after box`).not.toBeNull();
    if (beforeBox && afterBox) {
      expect(
        Math.abs(afterBox.y - beforeBox.y),
        `${viewport.label} composer y stays stable`
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('chat composer clears mobile shell tabs on tablet and phone', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; mobile shell tabs need a bypassed Clerk session.
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
