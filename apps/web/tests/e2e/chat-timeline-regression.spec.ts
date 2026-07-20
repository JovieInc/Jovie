/**
 * E2E: deterministic chat timeline regression coverage.
 *
 * This uses a mocked chat backend so the submit/stream/refetch path is
 * exercised without live provider keys. It specifically catches the class of
 * regressions where a visible streamed response is replaced by stale refetch
 * data after the UI appears settled.
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { waitForHydration } from './utils/smoke-test-utils';

const USER_TEXT = 'Hello from timeline smoke.';
const STREAMED_TEXT = 'Fresh streamed answer from the mocked backend.';
const STALE_TEXT = 'Older stale answer from refetch.';
const CONVERSATION_ID = 'conv-timeline-smoke';
const TURN_ID = 'turn-timeline-smoke';

function chatStreamResponse(): string {
  const metadata = {
    conversationId: CONVERSATION_ID,
    turnId: TURN_ID,
    requestId: 'req-timeline-smoke',
  };
  const chunks = [
    {
      type: 'start',
      messageId: 'assistant-timeline-smoke',
      messageMetadata: metadata,
    },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-timeline-smoke' },
    {
      type: 'text-delta',
      id: 'text-timeline-smoke',
      delta: 'Fresh streamed ',
    },
    {
      type: 'text-delta',
      id: 'text-timeline-smoke',
      delta: 'answer from the mocked backend.',
    },
    { type: 'text-end', id: 'text-timeline-smoke' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop', messageMetadata: metadata },
  ];

  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

async function mockTimelineBackend(page: Page) {
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
      body: JSON.stringify({ conversations: [] }),
    })
  );

  await page.route(`**/api/chat/conversations/${CONVERSATION_ID}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversation: {
          id: CONVERSATION_ID,
          title: 'Timeline smoke',
          createdAt: '2026-05-23T00:00:00.000Z',
          updatedAt: '2026-05-23T00:00:01.000Z',
        },
        messages: [
          {
            id: 'user-timeline-smoke',
            role: 'user',
            content: USER_TEXT,
            toolCalls: null,
            clientMessageId: 'client-timeline-smoke:user',
            turnId: TURN_ID,
            createdAt: '2026-05-23T00:00:00.000Z',
          },
          {
            id: 'assistant-timeline-smoke-stale',
            role: 'assistant',
            content: STALE_TEXT,
            toolCalls: null,
            clientMessageId: null,
            turnId: TURN_ID,
            createdAt: '2026-05-23T00:00:00.500Z',
          },
        ],
        hasMore: false,
      }),
    })
  );

  await page.route('**/api/chat', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'cache-control': 'no-cache',
        'x-conversation-id': CONVERSATION_ID,
        'x-chat-turn-id': TURN_ID,
      },
      body: chatStreamResponse(),
    });
  });
}

test.use({ storageState: { cookies: [], origins: [] } });

test('send and stream stay visible through stale refetch without skeleton cascade', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; chat shell entry needs a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await mockTimelineBackend(page);
  await setTestAuthBypassSession(page, null, 'e2e-chat-timeline');
  await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);

  const chatContent = page.locator('[data-testid="chat-content"]').last();
  await expect(chatContent).toBeVisible({
    timeout: 30_000,
  });

  const composerSurface = chatContent
    .locator('[data-testid="chat-composer-surface"]')
    .last();
  const composer = composerSurface.locator(
    'textarea[aria-label="Chat Message Input"]'
  );
  await expect(composer).toBeEnabled({ timeout: 15_000 });
  await composer.click();
  await page.keyboard.type(USER_TEXT);
  await expect(composer).toHaveValue(USER_TEXT);
  await expect(composerSurface).toHaveAttribute('data-surface-mode', 'typing', {
    timeout: 5_000,
  });

  const sendButton = composerSurface.getByRole('button', {
    name: /send message/i,
  });
  await expect(sendButton).toBeEnabled({ timeout: 5_000 });
  await sendButton.click();

  await expect(
    page.getByTestId('chat-user-bubble').filter({ hasText: USER_TEXT })
  ).toBeVisible({ timeout: 2_000 });
  await expect(
    page.locator('[data-testid="chat-loading-indicator"]')
  ).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('[data-testid="chat-loading"]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid="chat-loading-conversation-skeleton"]')
  ).toHaveCount(0);

  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: STREAMED_TEXT })
  ).toBeVisible({ timeout: 45_000 });
  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: STALE_TEXT })
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/chat/${CONVERSATION_ID}$`), {
    timeout: 15_000,
  });

  await page.waitForTimeout(750);
  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: STREAMED_TEXT })
  ).toBeVisible();
  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: STALE_TEXT })
  ).toHaveCount(0);
  await expect(page.locator('[data-testid="chat-loading"]')).toHaveCount(0);
});
