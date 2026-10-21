import {
  expect,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';
import { waitForHydration } from '../e2e/utils/smoke-test-utils';
import {
  installBrowserChatProbe,
  roundTripFromRequest,
} from './chat-performance-probe';

type ChatProbeWindow = Window & {
  __jovieChatPerformanceProbe?: {
    dataReadyMs?: number;
    fetchStartedMs?: number;
    frameId?: number;
    firstFeedbackMs?: number;
    longTaskDurations: number[];
    longTaskObserver?: PerformanceObserver;
    observer: MutationObserver;
    originalFetch: typeof window.fetch;
    renderToInteractiveMs?: number;
    start: number;
    usableStateMs?: number;
  };
};

const CONVERSATION_ID = 'conv-chat-performance';
export const SAMPLE_COUNT = 5;
export const WARMUP_ROUND_TRIPS = 3;
interface PersistedMessage {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly content: string;
  readonly toolCalls: null;
  readonly clientMessageId: string | null;
  readonly turnId: string;
  readonly createdAt: string;
}
export function chatStreamResponse(
  runIndex: number,
  assistantText: string
): string {
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
export async function mockChatBackend(page: Page) {
  const persistedMessages: PersistedMessage[] = [];
  let runIndex = 0;
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
}
export async function installChatProbe(
  page: Page,
  userText: string,
  assistantText: string
) {
  await page.evaluate(installBrowserChatProbe, {
    assistant: assistantText,
    user: userText,
  });
}
export async function triggerMeasuredSend(
  sendButton: ReturnType<Page['getByRole']>
): Promise<void> {
  await sendButton.evaluate(button => {
    const probeWindow = window as ChatProbeWindow;
    const probe = probeWindow.__jovieChatPerformanceProbe;
    if (!probe) {
      throw new Error('Chat performance probe was not installed');
    }
    probe.start = performance.now();
    (button as HTMLButtonElement).click();
  });
}
export async function readChatProbe(page: Page) {
  await page.waitForFunction(() => {
    const probeWindow = window as ChatProbeWindow;
    const probe = probeWindow.__jovieChatPerformanceProbe;
    return (
      probe?.firstFeedbackMs !== undefined &&
      probe.usableStateMs !== undefined &&
      probe.renderToInteractiveMs !== undefined
    );
  });
  return page.evaluate(() => {
    const probeWindow = window as ChatProbeWindow;
    const probe = probeWindow.__jovieChatPerformanceProbe;
    if (
      !probe ||
      probe.firstFeedbackMs === undefined ||
      probe.usableStateMs === undefined ||
      probe.renderToInteractiveMs === undefined
    ) {
      throw new Error('Chat performance probe did not collect every metric');
    }
    probe.observer.disconnect();
    if (probe.frameId !== undefined) cancelAnimationFrame(probe.frameId);
    probe.longTaskObserver?.disconnect();
    window.fetch = probe.originalFetch;
    return {
      dataReadyMs: probe.dataReadyMs,
      fetchStartedMs: probe.fetchStartedMs,
      firstFeedbackMs: probe.firstFeedbackMs,
      longTaskCount: probe.longTaskDurations.length,
      maxLongTaskMs: Math.max(0, ...probe.longTaskDurations),
      renderToInteractiveMs: probe.renderToInteractiveMs,
      usableStateMs: probe.usableStateMs,
    };
  });
}
export async function measureDroppedScrollFrames(page: Page) {
  return (await measureChatScrollFrames(page)).droppedFrameCount;
}
export async function measureChatScrollFrames(page: Page) {
  return page.getByTestId('chat-message-scroll').evaluate(async element => {
    const scrollElement = element as HTMLElement;
    if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
      throw new Error('Chat message list must overflow for the scroll ratchet');
    }
    scrollElement.scrollTop = 0;
    const frameIntervals: number[] = [];
    let rendererHidden = false;
    const frameCount = 24;
    await new Promise<void>(resolve => {
      let previousTime: number | undefined;
      let currentFrame = 0;
      const step = (time: number) => {
        rendererHidden ||=
          document.visibilityState !== 'visible' || !document.hasFocus();
        if (previousTime !== undefined) {
          frameIntervals.push(time - previousTime);
        }
        previousTime = time;
        currentFrame += 1;
        scrollElement.scrollTop =
          (scrollElement.scrollHeight - scrollElement.clientHeight) *
          (currentFrame / frameCount);
        if (currentFrame >= frameCount) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return {
      droppedFrameCount: frameIntervals.filter(interval => interval > 50)
        .length,
      frameCount: frameIntervals.length,
      rendererHidden,
    };
  });
}
function isChatApiRequest(request: Request): boolean {
  const { pathname } = new URL(request.url());
  return pathname === '/api/chat' || pathname.startsWith('/api/chat/');
}
export function trackChatApiRequests(page: Page) {
  const inFlight = new Set<Request>();
  page.on('request', request => {
    if (isChatApiRequest(request)) inFlight.add(request);
  });
  page.on('requestfinished', request => inFlight.delete(request));
  page.on('requestfailed', request => inFlight.delete(request));
  return { pendingCount: () => inFlight.size };
}
async function waitForMainThreadIdle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (typeof window.requestIdleCallback === 'function') {
              window.requestIdleCallback(() => resolve());
            } else {
              setTimeout(resolve, 0);
            }
          });
        });
      })
  );
}
export async function waitForChatRouteReady(
  page: Page,
  chatContent: Locator,
  composer: Locator,
  chatApi: ReturnType<typeof trackChatApiRequests>
): Promise<void> {
  await waitForHydration(page);
  await expect(chatContent).toBeVisible({ timeout: 30_000 });
  await expect(composer).toBeEnabled({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        await waitForMainThreadIdle(page);
        return chatApi.pendingCount();
      },
      { timeout: 30_000 }
    )
    .toBe(0);
}
export async function remountChatRoute(
  page: Page,
  chatContent: Locator,
  composer: Locator,
  chatApi: ReturnType<typeof trackChatApiRequests>,
  route = '/app/chat'
): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await waitForChatRouteReady(page, chatContent, composer, chatApi);
}
export async function exchangeChatRoundTrip(
  page: Page,
  composer: Locator,
  sendButton: Locator,
  userText: string,
  assistantText: string
) {
  await expect(composer).toBeEnabled();
  await composer.fill(userText);
  await installChatProbe(page, userText, assistantText);
  await triggerMeasuredSend(sendButton);
  await expect(
    page.getByTestId('chat-user-bubble').filter({ hasText: userText })
  ).toBeVisible();
  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: assistantText })
  ).toBeVisible();
  return readChatProbe(page);
}
