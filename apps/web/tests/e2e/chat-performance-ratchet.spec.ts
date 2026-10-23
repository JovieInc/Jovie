/**
 * Deploy-gating chat responsiveness ratchet (JOV-3887).
 *
 * The backend is deterministic so this test isolates browser rendering and
 * interaction latency on the real authenticated chat route. Network/provider
 * latency is covered separately by production telemetry.
 *
 * @smoke
 */

import {
  expect,
  type Locator,
  type Page,
  type Request,
  test,
} from '@playwright/test';
import { CHAT_TRANSCRIPT_WINDOW } from '@/lib/chat/transcript-window';
import { UX_LATENCY_STORAGE_KEY } from '@/lib/monitoring/interaction-latency';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '@/scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  installBrowserChatProbe,
  roundTripCopy,
  roundTripFromRequest,
} from '../helpers/chat-performance-probe';
import { waitForHydration } from './utils/smoke-test-utils';

const CONVERSATION_ID = 'conv-chat-performance';
const SAMPLE_COUNT = 5;
/**
 * Cold `/app/chat` mounts on CI decay across the first few full reloads
 * (route compile and hydration). Five samples make p95 the worst sample, so
 * scoring those cold mounts fails a steady-state budget the warm samples
 * already meet. Discard this many unmeasured round trips, then score five
 * sends on that same warmed document. Remounting before each scored send
 * made p95 a cold mount again. A hot-path regression still fails.
 *
 * Oct 2 Extended Smoke knee (usable ms): 580, 314, 273, then 142 and 148.
 */
const WARMUP_ROUND_TRIPS = 3;
/** User plus assistant. The remounting warmup leaves one pair on the document. */
const MESSAGES_PER_ROUND_TRIP = 2;
/**
 * Virtualizing is a one-time commit. p95 of five samples is the slowest
 * sample, so that commit has to land before the clock starts. The scroll
 * probe still runs on the virtualized thread.
 */
const VIRTUAL_WINDOW_WARMUP_ROUND_TRIPS = Math.ceil(
  (CHAT_TRANSCRIPT_WINDOW.virtualizeAfterMessageCount +
    1 -
    MESSAGES_PER_ROUND_TRIP) /
    MESSAGES_PER_ROUND_TRIP
);

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

async function mockChatBackend(page: Page) {
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
}

async function installChatProbe(
  page: Page,
  userText: string,
  assistantText: string
) {
  await page.evaluate(installBrowserChatProbe, {
    assistant: assistantText,
    user: userText,
  });
}

async function triggerMeasuredSend(
  sendButton: ReturnType<Page['getByRole']>
): Promise<void> {
  await sendButton.evaluate(button => {
    const probeWindow = window as Window & {
      __jovieChatPerformanceProbe?: {
        start: number;
      };
    };
    const probe = probeWindow.__jovieChatPerformanceProbe;
    if (!probe) {
      throw new Error('Chat performance probe was not installed');
    }

    // Start the clock in the same browser task as the user action. Starting it
    // before Playwright's click would include actionability/stability checks,
    // which are test-runner overhead rather than product interaction latency.
    probe.start = performance.now();
    (button as HTMLButtonElement).click();
  });
}

async function readChatProbe(page: Page) {
  await page.waitForFunction(() => {
    const probeWindow = window as Window & {
      __jovieChatPerformanceProbe?: {
        dataReadyMs?: number;
        fetchStartedMs?: number;
        frameId?: number;
        firstFeedbackMs?: number;
        longTaskDurations: number[];
        renderToInteractiveMs?: number;
        usableStateMs?: number;
      };
    };
    const probe = probeWindow.__jovieChatPerformanceProbe;
    return (
      probe?.firstFeedbackMs !== undefined &&
      probe.usableStateMs !== undefined &&
      probe.renderToInteractiveMs !== undefined
    );
  });

  return page.evaluate(() => {
    const probeWindow = window as Window & {
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
        usableStateMs?: number;
      };
    };
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

async function measureDroppedScrollFrames(page: Page) {
  const scroll = page.getByTestId('chat-message-scroll');
  await scroll.evaluate(element => {
    const scrollElement = element as HTMLElement;
    if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
      throw new Error('Chat message list must overflow for the scroll ratchet');
    }
    // Jumping to the top swaps the virtual window and mounts the
    // scroll-to-latest control. Those commits are not scroll frames.
    scrollElement.scrollTop = 0;
  });
  await waitForQuietFrames(page);

  return scroll.evaluate(async element => {
    const scrollElement = element as HTMLElement;
    const frameIntervals: number[] = [];
    const frameCount = 24;
    const distance = scrollElement.scrollHeight - scrollElement.clientHeight;

    await new Promise<void>(resolve => {
      let previousTime: number | undefined;
      let currentFrame = 0;

      const step = (time: number) => {
        if (previousTime !== undefined) {
          frameIntervals.push(time - previousTime);
        }
        previousTime = time;
        currentFrame += 1;
        scrollElement.scrollTop = distance * (currentFrame / frameCount);

        if (currentFrame >= frameCount) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    });

    // A >50ms interval represents at least two consecutive missed 60Hz frames.
    return frameIntervals.filter(interval => interval > 50).length;
  });
}

function isChatApiRequest(request: Request): boolean {
  const { pathname } = new URL(request.url());
  return pathname === '/api/chat' || pathname.startsWith('/api/chat/');
}

/**
 * Counts in-flight chat-owned API requests (all served by `mockChatBackend`).
 *
 * `networkidle` is not a usable readiness signal on the chat route: the shell
 * must not full-prefetch every nav destination (that burst exceeds the shell
 * RSC budget). Query warming can still fetch Library data after mount. Those
 * requests are not bounded by the chat surface, so on a loaded CI server they
 * can keep the network busy past any timeout.
 */
function trackChatApiRequests(page: Page) {
  const inFlight = new Set<Request>();
  page.on('request', request => {
    if (isChatApiRequest(request)) inFlight.add(request);
  });
  page.on('requestfinished', request => inFlight.delete(request));
  page.on('requestfailed', request => inFlight.delete(request));
  return { pendingCount: () => inFlight.size };
}

/**
 * Scored clicks and the scroll probe share the runner with the rest of the
 * smoke lane. A frame that is already late is runner stall, and p95 of five
 * samples is the slowest sample. Wait until the event loop can deliver frames
 * before starting the clock. Give up after a few seconds so a wedged runner
 * still records the real interaction instead of hanging the lane.
 */
async function waitForQuietFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const started = performance.now();
        const gaps: number[] = [];
        let previous: number | undefined;
        const step = (time: number) => {
          if (settled) return;
          if (previous !== undefined) gaps.push(time - previous);
          previous = time;
          const recent = gaps.slice(-4);
          if (
            recent.length === 4 &&
            recent.every(gap => gap < 40) &&
            performance.now() - started > 50
          ) {
            finish();
            return;
          }
          if (performance.now() - started > 8_000) {
            finish();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        // rAF can stop entirely on a backgrounded page. The timeout is the
        // same 8s cap, so a frozen frame clock cannot hang the smoke lane.
        setTimeout(finish, 8_000);
      })
  );
}

/** Resolves after two painted frames and an idle main-thread slot. */
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

/**
 * Deterministic chat-route readiness: hydrated, chat surface and composer
 * usable, every chat API request settled, and the main thread idle. Each
 * sample starts from a quiescent chat surface without waiting on unrelated
 * background prefetches of other routes.
 */
async function waitForChatRouteReady(
  page: Page,
  chatContent: Locator,
  composer: Locator,
  chatApi: ReturnType<typeof trackChatApiRequests>
): Promise<void> {
  await waitForHydration(page);
  await expect(chatContent).toBeVisible({ timeout: 30_000 });
  await expect(composer).toBeEnabled({ timeout: 30_000 });
  // Idle first so mount effects have issued their chat fetches, then require
  // none outstanding; both must hold in the same pass.
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

async function remountChatRoute(
  page: Page,
  chatContent: Locator,
  composer: Locator,
  chatApi: ReturnType<typeof trackChatApiRequests>
): Promise<void> {
  // Warmup only. A scored sample that reloads measures route compile and
  // hydration, which the steady-state budget does not describe.
  await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
  await waitForChatRouteReady(page, chatContent, composer, chatApi);
}

/**
 * The composer allows one send per window and rejects the next click.
 * The last warmup send is already on this document, so the first scored
 * sample has to wait too. The probe clock is the click that armed the
 * limiter.
 */
async function waitForChatSendPacer(page: Page): Promise<void> {
  const windowMs = PACER_TIMING.CHAT_RATE_LIMIT_MS;
  await page.waitForFunction(limitMs => {
    const probe = (
      window as Window & {
        __jovieChatPerformanceProbe?: { start: number };
      }
    ).__jovieChatPerformanceProbe;
    return (
      probe !== undefined && performance.now() - probe.start >= limitMs + 100
    );
  }, windowMs);
}

async function exchangeChatRoundTrip(
  page: Page,
  composer: Locator,
  sendButton: Locator,
  userText: string,
  assistantText: string,
  settleMainThread = false
) {
  await expect(composer).toBeEnabled();
  await composer.fill(userText);
  if (settleMainThread) await waitForQuietFrames(page);
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

test.use({ storageState: { cookies: [], origins: [] } });

test('chat route stays within the deploy-gating responsiveness budget', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 480 });

  await mockChatBackend(page);
  const chatApi = trackChatApiRequests(page);
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-chat-performance');
  await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });

  const chatContent = page.getByTestId('chat-content').last();
  const composer = chatContent.locator(
    'textarea[aria-label="Chat Message Input"]'
  );
  const sendButton = chatContent.getByRole('button', {
    name: /send message/i,
  });
  await waitForChatRouteReady(page, chatContent, composer, chatApi);

  for (
    let warmupIndex = 0;
    warmupIndex < WARMUP_ROUND_TRIPS;
    warmupIndex += 1
  ) {
    if (warmupIndex > 0) {
      await remountChatRoute(page, chatContent, composer, chatApi);
    }
    const copy = roundTripCopy('Warmup', warmupIndex);
    await exchangeChatRoundTrip(
      page,
      composer,
      sendButton,
      copy.userText,
      copy.assistantText
    );
  }

  // The virtualizer turns on once the thread passes the window threshold.
  // That commit is not a steady-state send. Cross it on this document, then
  // drop every warmup sample before scoring.
  for (
    let warmupIndex = 0;
    warmupIndex < VIRTUAL_WINDOW_WARMUP_ROUND_TRIPS;
    warmupIndex += 1
  ) {
    await waitForChatSendPacer(page);
    const copy = roundTripCopy('Warmup', WARMUP_ROUND_TRIPS + warmupIndex);
    await exchangeChatRoundTrip(
      page,
      composer,
      sendButton,
      copy.userText,
      copy.assistantText
    );
  }

  // Warmup sends are real product interactions and land in the UX latency
  // store. Drop them so the assertion below still proves exactly the scored
  // samples were recorded.
  await page.evaluate(storageKey => {
    localStorage.removeItem(storageKey);
  }, UX_LATENCY_STORAGE_KEY);

  const samples: InteractionLatencySample[] = [];

  for (let runIndex = 0; runIndex < SAMPLE_COUNT; runIndex += 1) {
    await waitForChatSendPacer(page);
    const copy = roundTripCopy('Performance', runIndex);
    const timings = await exchangeChatRoundTrip(
      page,
      composer,
      sendButton,
      copy.userText,
      copy.assistantText,
      true
    );
    samples.push({
      ...timings,
      runIndex,
      scenarioId: 'chat-message-round-trip',
    });
  }

  await waitForQuietFrames(page);
  const droppedFrameCount = await measureDroppedScrollFrames(page);
  const completeSamples = samples.map(sample => ({
    ...sample,
    droppedFrameCount,
  }));
  const report = buildInteractionLatencyReport({ samples: completeSamples });

  await testInfo.attach('chat-performance-report.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });

  expect(report.status, JSON.stringify(report.summaries, null, 2)).toBe('pass');

  const uxLatencyStore = await page.evaluate(storageKey => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, UX_LATENCY_STORAGE_KEY);
  expect(uxLatencyStore).toMatchObject({
    version: 1,
    samples: {
      chat_first_token: expect.any(Array),
      chat_send_round_trip: expect.any(Array),
    },
  });
  expect(uxLatencyStore.samples.chat_first_token).toHaveLength(SAMPLE_COUNT);
  expect(uxLatencyStore.samples.chat_send_round_trip).toHaveLength(
    SAMPLE_COUNT
  );
  expect(
    Object.keys(uxLatencyStore.samples.chat_first_token[0]).sort()
  ).toEqual(['durationMs', 'recordedAt']);
});
