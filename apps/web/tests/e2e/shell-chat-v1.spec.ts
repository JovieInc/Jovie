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
import {
  chatComposerInputLocator,
  gotoAuthenticatedChatRoute,
} from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const FLYOUT_CONVERSATION_ID = 'conv-flyout-layering';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function gotoChatConversation(page: Page, conversationId: string) {
  await gotoAuthenticatedChatRoute(page, {
    path: `/app/chat/${conversationId}`,
    urlPattern: new RegExp(`/app/chat/${conversationId}$`),
  });
}

async function mockStableSlashPickerNetwork(page: Page) {
  // Root slash queries like `/t` fan out to artist search. In CI the real
  // Spotify route can stall for ~10s and return 503, which keeps the picker
  // in a loading state long enough for transcript overlap assertions to flake.
  await page.route('**/api/spotify/search**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );
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
  await mockStableSlashPickerNetwork(page);

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
                'Hey Tim. I can help with your profile, releases, promotion strategy, pitch drafts, and analytics.',
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
  const composer = shellFrame.locator('[data-testid="chat-composer-surface"]');
  const input = chatComposerInputLocator(composer);

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

async function waitForPickerScrollSettled(page: Page) {
  const { shellScroll } = shellChatFrameLocators(page);
  await expect
    .poll(
      async () => {
        const metrics = await shellScroll.evaluate(node => ({
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        }));
        return (
          metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 4
        );
      },
      {
        message: 'thread scroll reaches bottom after slash picker opens',
        timeout: 45_000,
      }
    )
    .toBe(true);
}

async function assertSlashMenuClearsThreadContent(page: Page) {
  const chatContent = page.locator('[data-testid="chat-content"]');
  await expect(chatContent).toHaveAttribute('data-picker-open', 'true', {
    timeout: 30_000,
  });

  const slashMenu = page.locator('[data-testid="slash-command-menu"]').last();
  await expect(slashMenu).toBeVisible({ timeout: 30_000 });
  await waitForPickerScrollSettled(page);

  const menuBox = await slashMenu.boundingBox();
  expectBoxInsideViewport(menuBox, page.viewportSize());
  if (!menuBox) return;

  const protectedTargets = [
    {
      label: 'latest assistant reply',
      locator: page.getByTestId('chat-message-reply').filter({
        hasText: 'Your bio is currently not set',
      }),
    },
    {
      label: 'bio tool status row',
      locator: page.getByTestId('tool-status-row').filter({
        hasText: 'Bio ready',
      }),
    },
    {
      label: 'latest user bubble',
      locator: page.getByTestId('chat-user-bubble').filter({
        hasText: 'whats my bio',
      }),
    },
  ];

  for (const { label, locator } of protectedTargets) {
    const targetBox = await locator.boundingBox();
    expect(targetBox, `${label} box`).not.toBeNull();
    await expect
      .poll(
        async () => {
          const currentMenuBox = await slashMenu.boundingBox();
          const currentTargetBox = await locator.boundingBox();
          if (!currentMenuBox || !currentTargetBox) return false;
          return !boxesOverlap(currentMenuBox, currentTargetBox, 4);
        },
        { message: `${label} clears slash menu`, timeout: 45_000 }
      )
      .toBe(true);
  }
}

async function resetSlashPicker(page: Page) {
  const { input } = shellChatFrameLocators(page);
  await page.keyboard.press('Escape');
  await input.fill('');
  await expect(page.locator('[data-testid="slash-command-menu"]')).toHaveCount(
    0
  );
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
  await gotoAuthenticatedChatRoute(page);

  const { chatContent, composer, shellFrame } = shellChatFrameLocators(page);

  await expect(shellFrame).toBeVisible({
    timeout: 30_000,
  });
  await expect(chatContent).toBeVisible({ timeout: 30_000 });
  await expect(composer).toHaveCSS(
    'border-radius',
    // --radius-full is canonically 9999px; the other values cover responsive
    // legacy surfaces while the token migration remains in flight.
    /^(?:9999px|999px|18px|20px|24px|28px|36px|45rem)$/
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

  await mockStableSlashPickerNetwork(page);
  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-chat-picker-user'
  );
  await gotoAuthenticatedChatRoute(page);

  const { composer, input, shellScroll } = shellChatFrameLocators(page);
  await expect(composer).toBeVisible({ timeout: 30_000 });

  const stableComposerBox = async () => {
    let previous = await composer.boundingBox();
    let settled = previous;
    let consecutiveStableSamples = 0;

    await expect
      .poll(
        async () => {
          const current = await composer.boundingBox();
          if (!current || !previous) {
            previous = current;
            consecutiveStableSamples = 0;
            return false;
          }

          const stable = (['x', 'y', 'width', 'height'] as const).every(
            key => Math.abs(current[key] - previous![key]) <= 0.1
          );
          consecutiveStableSamples = stable ? consecutiveStableSamples + 1 : 0;
          previous = current;
          settled = current;
          // Framer Motion springs can cross a low-velocity point before their
          // final resting position. Hold the geometry steady for 500ms so the
          // assertion compares settled states, not an intermediate frame.
          return consecutiveStableSamples >= 5;
        },
        { timeout: 10_000, intervals: [100] }
      )
      .toBe(true);

    return settled;
  };

  const beforeBox = await stableComposerBox();
  const beforeScrollTop = await shellScroll.evaluate(
    element => element.scrollTop
  );

  await input.fill('/');
  await expect(composer).toHaveAttribute('data-surface-mode', 'root');
  await expect(page.locator('[data-testid="slash-command-menu"]')).toBeVisible({
    timeout: 10_000,
  });

  const afterBox = await stableComposerBox();
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
  test.setTimeout(300_000);

  await mockFlyoutConversation(page);
  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-chat-flyout-user'
  );

  await gotoChatConversation(page, FLYOUT_CONVERSATION_ID);

  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: 'short desktop', width: 1280, height: 720 },
  ] as const) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const { composer, input } = shellChatFrameLocators(page);
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await resetSlashPicker(page);

    const latestAssistantReply = page.getByTestId('chat-message-reply').filter({
      hasText: 'Your bio is currently not set',
    });
    await latestAssistantReply.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(latestAssistantReply).toBeVisible({ timeout: 30_000 });

    const beforeBox = await composer.boundingBox();
    await input.fill('/t');
    await expect(composer).toHaveAttribute('data-surface-mode', 'root');
    await assertSlashMenuClearsThreadContent(page);

    // Slash-picker scroll/layout passes can remount the composer; re-resolve locators.
    const { composer: composerAfterPicker, input: inputAfterPicker } =
      shellChatFrameLocators(page);
    await expect(composerAfterPicker).toBeVisible({ timeout: 30_000 });
    await expect(inputAfterPicker).toBeVisible({ timeout: 30_000 });
    await inputAfterPicker.fill('/tak');
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
    await resetSlashPicker(page);
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
    await gotoAuthenticatedChatRoute(page);

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
