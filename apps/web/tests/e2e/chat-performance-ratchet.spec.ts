/**
 * Deploy-gating chat responsiveness ratchet (JOV-3887).
 *
 * The backend is deterministic so this test isolates browser rendering and
 * interaction latency on the real authenticated chat route. Network/provider
 * latency is covered separately by production telemetry.
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '@/scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { waitForHydration } from './utils/smoke-test-utils';

const CONVERSATION_ID = 'conv-chat-performance';
const SAMPLE_COUNT = 5;

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
    const userText = `Performance message ${currentRun + 1}`;
    const assistantText =
      `Performance reply ${currentRun + 1}. ` +
      'This deterministic response is long enough to exercise the real message list layout.';
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

    await page.evaluate(() => {
      const probeWindow = window as Window & {
        __jovieChatPerformanceProbe?: {
          dataReadyMs?: number;
          start: number;
        };
      };
      const probe = probeWindow.__jovieChatPerformanceProbe;
      if (probe) {
        probe.dataReadyMs = performance.now() - probe.start;
      }
    });

    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'cache-control': 'no-cache',
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
  await page.evaluate(
    ({ assistant, user }) => {
      const probeWindow = window as Window & {
        __jovieChatPerformanceProbe?: {
          dataReadyMs?: number;
          fetchStartedMs?: number;
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
      probeWindow.__jovieChatPerformanceProbe?.observer.disconnect();

      const start = performance.now();
      const probe = {
        start,
        observer: undefined as unknown as MutationObserver,
        longTaskDurations: [],
        originalFetch: window.fetch,
      } as NonNullable<typeof probeWindow.__jovieChatPerformanceProbe>;
      try {
        probe.longTaskObserver = new PerformanceObserver(list => {
          probe.longTaskDurations.push(
            ...list.getEntries().map(entry => entry.duration)
          );
        });
        probe.longTaskObserver.observe({ type: 'longtask' });
      } catch {
        // Long-task entries are unavailable in some browser engines.
      }
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (
          probe.fetchStartedMs === undefined &&
          new URL(url, window.location.origin).pathname === '/api/chat'
        ) {
          probe.fetchStartedMs = performance.now() - start;
        }
        return originalFetch(input, init);
      };

      const observer = new MutationObserver(() => {
        const bodyText = document.body.textContent ?? '';
        const now = performance.now();

        if (probe.firstFeedbackMs === undefined && bodyText.includes(user)) {
          probe.firstFeedbackMs = now - start;
        }

        if (probe.usableStateMs === undefined && bodyText.includes(assistant)) {
          probe.usableStateMs = now - start;
          const renderStart = now;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const composer = document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Chat Message Input"]'
              );
              if (composer && !composer.disabled) {
                probe.renderToInteractiveMs = performance.now() - renderStart;
              }
            });
          });
        }
      });

      probe.observer = observer;
      probeWindow.__jovieChatPerformanceProbe = probe;
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    },
    { assistant: assistantText, user: userText }
  );
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
  return page.getByTestId('chat-message-scroll').evaluate(async element => {
    const scrollElement = element as HTMLElement;
    if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
      throw new Error('Chat message list must overflow for the scroll ratchet');
    }

    scrollElement.scrollTop = 0;
    const frameIntervals: number[] = [];
    const frameCount = 24;

    await new Promise<void>(resolve => {
      let previousTime: number | undefined;
      let currentFrame = 0;

      const step = (time: number) => {
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

    // A >50ms interval represents at least two consecutive missed 60Hz frames.
    return frameIntervals.filter(interval => interval > 50).length;
  });
}

test.use({ storageState: { cookies: [], origins: [] } });

test('chat route stays within the deploy-gating responsiveness budget', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 480 });

  await mockChatBackend(page);
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-chat-performance');
  await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await page.waitForLoadState('networkidle');

  const chatContent = page.getByTestId('chat-content').last();
  await expect(chatContent).toBeVisible({ timeout: 30_000 });
  const composer = chatContent.locator(
    'textarea[aria-label="Chat Message Input"]'
  );
  const sendButton = chatContent.getByRole('button', {
    name: /send message/i,
  });
  const samples: InteractionLatencySample[] = [];

  for (let runIndex = 0; runIndex < SAMPLE_COUNT; runIndex += 1) {
    if (runIndex > 0) {
      // A full route mount makes each sample independent and resets the
      // intentional one-message-per-second composer pacer without sleeping.
      await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      await page.waitForLoadState('networkidle');
      await expect(chatContent).toBeVisible({ timeout: 30_000 });
    }

    const userText = `Performance message ${runIndex + 1}`;
    const assistantText =
      `Performance reply ${runIndex + 1}. ` +
      'This deterministic response is long enough to exercise the real message list layout.';

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

    const timings = await readChatProbe(page);
    samples.push({
      ...timings,
      runIndex,
      scenarioId: 'chat-message-round-trip',
    });
  }

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
});
