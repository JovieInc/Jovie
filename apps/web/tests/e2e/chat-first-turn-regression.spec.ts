/**
 * E2E: first-turn action reliability for unavailable album art.
 *
 * Covers the user-visible regression contract:
 * - chat opens as a chat-specific empty state, not the dashboard welcome state
 * - unavailable album-art action is disabled before invocation
 * - typed album-art generation produces a durable assistant transcript item
 * - refresh restores the same user + assistant messages
 */

import { expect, type Page, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

const UNAVAILABLE_MESSAGE =
  'Album art generation is temporarily unavailable. I can still help you draft a cover concept, album-art brief, or visual direction you can use with a designer or generator.';

function chatStreamResponse(): string {
  const metadata = {
    conversationId: 'conv-album-unavailable',
    turnId: 'turn-album-unavailable',
    requestId: 'req-album-unavailable',
  };
  const chunks = [
    {
      type: 'start',
      messageId: 'assistant-album-unavailable',
      messageMetadata: metadata,
    },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-album-unavailable' },
    {
      type: 'text-delta',
      id: 'text-album-unavailable',
      delta: UNAVAILABLE_MESSAGE,
    },
    { type: 'text-end', id: 'text-album-unavailable' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop', messageMetadata: metadata },
  ];

  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('');
}

async function mockChatLifecycle(page: Page) {
  await page.route('**/api/chat/capabilities**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tools: {
          albumArt: {
            availability: 'unavailable',
            reason: 'Album art generation is temporarily unavailable.',
            reasonCode: 'PROVIDER_UNAVAILABLE',
          },
        },
      }),
    })
  );

  await page.route('**/api/chat/conversations?*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] }),
    })
  );

  await page.route('**/api/chat/conversations/conv-album-unavailable', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversation: {
          id: 'conv-album-unavailable',
          title: 'Generate album art',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:01.000Z',
        },
        messages: [
          {
            id: 'user-album-unavailable',
            role: 'user',
            content: 'Generate album art for my latest release.',
            toolCalls: null,
            createdAt: '2026-05-16T00:00:00.000Z',
          },
          {
            id: 'assistant-album-unavailable',
            role: 'assistant',
            content: UNAVAILABLE_MESSAGE,
            toolCalls: null,
            createdAt: '2026-05-16T00:00:01.000Z',
          },
        ],
        hasMore: false,
      }),
    })
  );

  await page.route('**/api/chat', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'cache-control': 'no-cache',
        'x-conversation-id': 'conv-album-unavailable',
        'x-chat-turn-id': 'turn-album-unavailable',
      },
      body: chatStreamResponse(),
    })
  );
}

test.use({ storageState: { cookies: [], origins: [] } });

test('new thread album-art unavailable state survives refresh', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(240_000);

  await mockChatLifecycle(page);
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-chat-first-turn');
  await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Welcome back/i)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Generate album art' })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Draft album-art brief' })
  ).toBeEnabled();

  const composer = page
    .getByPlaceholder(/ask jovie|ask a follow-up|chat message/i)
    .first();
  await composer.fill('Generate album art for my latest release.');
  await page.getByRole('button', { name: /send message/i }).click();

  await expect(
    page.getByText('Generate album art for my latest release.')
  ).toBeVisible();
  await expect(page.getByText(UNAVAILABLE_MESSAGE)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Creating album art/i)).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/chat\/conv-album-unavailable$/, {
    timeout: 15_000,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('Generate album art for my latest release.')
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(UNAVAILABLE_MESSAGE)).toBeVisible();
  await expect(page.getByText(/Welcome back/i)).toHaveCount(0);
});
