import type { Page } from '@playwright/test';
import { roundTripFromRequest } from './chat-performance-probe';

export const CONVERSATION_ID = 'conv-chat-performance';

declare global {
  interface Window {
    __jovieHoldChatResponse?: boolean;
    __jovieReleaseChatResponse?: () => void;
  }
}

interface PersistedMessage {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly content: string;
  readonly toolCalls: null;
  readonly clientMessageId: string | null;
  readonly turnId: string;
  readonly createdAt: string;
}

function chatStreamResponse(runIndex: number, assistantText: string): string {
  const suffix = String(runIndex);
  const metadata = {
    conversationId: CONVERSATION_ID,
    turnId: `turn-chat-performance-${suffix}`,
    requestId: `request-chat-performance-${suffix}`,
  };
  const chunks = [
    {
      type: 'start',
      messageId: `assistant-chat-performance-${suffix}`,
      messageMetadata: metadata,
    },
    { type: 'start-step' },
    { type: 'text-start', id: `text-chat-performance-${suffix}` },
    {
      type: 'text-delta',
      id: `text-chat-performance-${suffix}`,
      delta: assistantText,
    },
    { type: 'text-end', id: `text-chat-performance-${suffix}` },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop', messageMetadata: metadata },
  ];

  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

export async function mockChatBackend(page: Page, persisted = false) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        !window.__jovieHoldChatResponse ||
        !response.headers.has('x-chat-turn-id')
      )
        return response;
      window.__jovieHoldChatResponse = false;
      const body = await response.text();
      const split = body.indexOf('data: {"type":"text-end"');
      if (split < 0) throw new Error('Missing stream fixture boundary');
      const encoder = new TextEncoder();
      const signal =
        init?.signal ?? (input instanceof Request ? input.signal : undefined);
      let cleanup = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const abort = () => {
            cleanup();
            controller.error(new DOMException('Aborted', 'AbortError'));
          };
          cleanup = () => {
            signal?.removeEventListener('abort', abort);
            delete window.__jovieReleaseChatResponse;
          };
          if (signal?.aborted) {
            abort();
            return;
          }
          signal?.addEventListener('abort', abort, { once: true });
          controller.enqueue(encoder.encode(body.slice(0, split)));
          window.__jovieReleaseChatResponse = () => {
            controller.enqueue(encoder.encode(body.slice(split)));
            controller.close();
            cleanup();
          };
        },
        cancel() {
          cleanup();
        },
      });
      return new Response(stream, {
        status: response.status,
        headers: response.headers,
      });
    };
  });
  const persistedMessages: PersistedMessage[] = persisted
    ? [
        {
          id: 'seed-user',
          role: 'user',
          content: 'Earlier question',
          toolCalls: null,
          clientMessageId: 'seed-client',
          turnId: 'seed-turn',
          createdAt: '2026-07-23T00:00:00.000Z',
        },
        {
          id: 'seed-assistant',
          role: 'assistant',
          content: 'Earlier reply',
          toolCalls: null,
          clientMessageId: null,
          turnId: 'seed-turn',
          createdAt: '2026-07-23T00:00:01.000Z',
        },
      ]
    : [];
  let failNext = false;
  let runIndex = 0;

  // Exercise the installed Blob client's real upload/confirm path without an
  // external upload. The token below is a synthetic fixture, never a credential.
  await page.route('**/api/chat/files/upload-token', route =>
    route.fulfill({
      json: {
        presignedUrlPayload: {
          delegationToken: `${Buffer.from(JSON.stringify({ storeId: 'ratchet' })).toString('base64url')}.fixture`,
          signature: 'fixture',
          params: {},
        },
      },
    })
  );
  await page.route('https://vercel.com/api/blob/**', route =>
    route.fulfill({
      json: {
        url: 'https://ratchet.public.blob.vercel-storage.com/fixture.png',
        downloadUrl:
          'https://ratchet.public.blob.vercel-storage.com/fixture.png',
        pathname: 'fixture.png',
        contentType: 'image/png',
        contentDisposition: 'inline',
        etag: 'fixture',
      },
    })
  );
  await page.route('**/api/chat/files/confirm', route =>
    route.fulfill({
      json: {
        blobUrl: 'https://ratchet.public.blob.vercel-storage.com/fixture.png',
        contentType: 'image/png',
      },
    })
  );

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
          title: 'Chat performance',
          createdAt: '2026-07-23T00:00:00.000Z',
          updatedAt: '2026-07-23T00:00:01.000Z',
        },
        messages: persistedMessages,
        hasMore: false,
      }),
    })
  );

  await page.route('**/api/chat', async route => {
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Deterministic send failure' }),
      });
    }
    const currentRun = runIndex;
    const { userText, assistantText } = roundTripFromRequest(
      route.request().postDataJSON()
    );
    const turnId = `turn-chat-performance-${currentRun}`;
    const createdAt = new Date(
      Date.UTC(2026, 6, 23, 0, 0, currentRun * 2)
    ).toISOString();

    persistedMessages.push(
      {
        id: `user-chat-performance-${currentRun}`,
        role: 'user',
        content: userText,
        toolCalls: null,
        clientMessageId: `client-chat-performance-${currentRun}`,
        turnId,
        createdAt,
      },
      {
        id: `assistant-chat-performance-${currentRun}`,
        role: 'assistant',
        content: assistantText,
        toolCalls: null,
        clientMessageId: null,
        turnId,
        createdAt,
      }
    );
    runIndex += 1;

    // Stamp dataReadyMs in the page's own fetch wrapper. page.evaluate inside
    // this route deadlocks the in-flight chat POST, so the optimistic user
    // bubble paints and the assistant reply never arrives.
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'cache-control': 'no-cache',
        'x-vercel-ai-ui-message-stream': 'v1',
        'x-conversation-id': CONVERSATION_ID,
        'x-chat-turn-id': turnId,
      },
      body: chatStreamResponse(currentRun, assistantText),
    });
  });
  return {
    failNextSend: () => {
      failNext = true;
    },
  };
}
