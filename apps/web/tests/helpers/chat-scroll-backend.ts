import type { Page } from '@playwright/test';
import { CHAT_TRANSCRIPT_WINDOW } from '@/lib/chat/transcript-window';

export const SCROLL_CONVERSATION_ID = 'conv-scroll-performance';
export const SCROLL_STREAM_TEXT = 'A deterministic streaming reply. ';

export function persistedScrollHistory(count: 200 | 2000) {
  return Array.from({ length: count }, (_, index) => ({
    id: `history-${String(index).padStart(6, '0')}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `History ${index + 1}. ${'Persisted transcript content. '.repeat(1 + (index % 6))}`,
    toolCalls: null,
    clientMessageId: null,
    turnId: `history-turn-${Math.floor(index / 2)}`,
    createdAt: new Date(Date.UTC(2026, 6, 23) + index * 1000).toISOString(),
  }));
}

/** Deterministic responses to the product's real limit/before requests. */
export async function installScrollBackend(page: Page, count: 200 | 2000) {
  const history = persistedScrollHistory(count);
  const requests: {
    before: string | null;
    limit: number;
    firstIndex: number;
  }[] = [];
  let releasePage: (() => void) | undefined;
  let heldPage: Promise<void> | undefined;
  await page.route('**/api/chat/capabilities**', route =>
    route.fulfill({ json: { tools: {} } })
  );
  await page.route('**/api/chat/conversations?*', route =>
    route.fulfill({ json: { conversations: [] } })
  );
  await page.route(
    `**/api/chat/conversations/${SCROLL_CONVERSATION_ID}*`,
    async route => {
      const url = new URL(route.request().url());
      const limit = Number(url.searchParams.get('limit') ?? 100);
      const before = url.searchParams.get('before');
      const eligible = history.filter(
        message => !before || message.createdAt < before
      );
      const messages = eligible.slice(-limit);
      requests.push({
        before,
        limit,
        firstIndex: history.indexOf(messages[0]),
      });
      if (before && heldPage) {
        const pending = heldPage;
        heldPage = undefined;
        await pending;
      }
      await route.fulfill({
        json: {
          conversation: {
            id: SCROLL_CONVERSATION_ID,
            title: 'Scroll performance',
            createdAt: history[0].createdAt,
            updatedAt: history.at(-1)!.createdAt,
          },
          messages,
          hasMore: eligible.length > limit,
        },
      });
    }
  );
  await page.addInitScript(
    ({ conversationId, text }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (
          new URL(url, location.origin).pathname !== '/api/chat' ||
          init?.method?.toUpperCase() !== 'POST'
        ) {
          return originalFetch(input, init);
        }
        const state = { chunks: 0, active: true, finish: () => {} };
        (window as Window & { __scrollStream?: typeof state }).__scrollStream =
          state;
        const metadata = {
          conversationId,
          turnId: 'scroll-stream-turn',
          requestId: 'scroll-stream-request',
        };
        const encoder = new TextEncoder();
        let timer: ReturnType<typeof setInterval>;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const push = (chunk: unknown) =>
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            push({
              type: 'start',
              messageId: 'scroll-live-assistant',
              messageMetadata: metadata,
            });
            push({ type: 'start-step' });
            push({ type: 'text-start', id: 'scroll-text' });
            const stop = () => {
              clearInterval(timer);
              state.active = false;
            };
            state.finish = () => {
              if (!state.active) return;
              stop();
              push({ type: 'text-end', id: 'scroll-text' });
              push({ type: 'finish-step' });
              push({
                type: 'finish',
                finishReason: 'stop',
                messageMetadata: metadata,
              });
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            };
            // 20Hz data; the real AI SDK and its existing UI throttle still render it.
            timer = setInterval(() => {
              state.chunks += 1;
              push({
                type: 'text-delta',
                id: 'scroll-text',
                delta: state.chunks === 1 ? text : 'stream ',
              });
            }, 50);
            init.signal?.addEventListener(
              'abort',
              () => {
                stop();
                controller.error(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          },
          cancel() {
            clearInterval(timer);
            state.active = false;
          },
        });
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'x-vercel-ai-ui-message-stream': 'v1',
            'x-conversation-id': conversationId,
            'x-chat-turn-id': metadata.turnId,
          },
        });
      };
    },
    { conversationId: SCROLL_CONVERSATION_ID, text: SCROLL_STREAM_TEXT }
  );
  return {
    requests,
    pageSize: CHAT_TRANSCRIPT_WINDOW.initialMessageWindow,
    holdNextPage() {
      heldPage = new Promise(resolve => {
        releasePage = resolve;
      });
    },
    releasePage() {
      releasePage?.();
      releasePage = undefined;
    },
  };
}
