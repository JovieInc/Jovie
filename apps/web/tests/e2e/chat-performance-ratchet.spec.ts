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
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { UX_LATENCY_STORAGE_KEY } from '@/lib/monitoring/interaction-latency';
import { INTERACTION_CLASS_BUDGETS } from '@/scripts/performance-interaction-manifest';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
  percentile,
} from '@/scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  CONVERSATION_ID,
  mockChatBackend,
} from '../helpers/chat-performance-backend';
import {
  installBrowserChatProbe,
  roundTripCopy,
} from '../helpers/chat-performance-probe';
import { waitForHydration } from './utils/smoke-test-utils';

const SAMPLE_COUNT = 5;
/**
 * Cold `/app/chat` mounts on CI decay across the first few full reloads
 * (route compile and hydration). Five samples make p95 the worst sample, so
 * scoring those cold mounts fails a steady-state budget the warm samples
 * already meet. Discard this many unmeasured round trips, then score the
 * same five-sample p50/p95 budgets. A hot-path regression still fails.
 *
 * Oct 2 Extended Smoke knee (usable ms): 580, 314, 273, then 142 and 148.
 */
const WARMUP_ROUND_TRIPS = 3;

async function installChatProbe(
  page: Page,
  userText: string,
  assistantText: string
) {
  await page.evaluate(installBrowserChatProbe, {
    assistant: assistantText,
    user: userText,
    rootSelector: '[data-testid="chat-content"]',
  });
}

async function triggerMeasuredSend(target: Locator, keyboard = false) {
  await target.evaluate((element, keyboard) => {
    const probe = window.__jovieChatPerformanceProbe;
    if (!probe) throw new Error('Chat performance probe was not installed');
    // Dispatch and timestamp share a browser task, outside actionability waits.
    probe.start = performance.now();
    if (keyboard)
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );
    else (element as HTMLButtonElement).click();
  }, keyboard);
}

async function readChatProbe(page: Page) {
  await page.waitForFunction(() => {
    const probe = window.__jovieChatPerformanceProbe;
    return (
      probe?.firstFeedbackMs !== undefined &&
      probe.usableStateMs !== undefined &&
      probe.renderToInteractiveMs !== undefined
    );
  });
  return page.evaluate(() => {
    const probe = window.__jovieChatPerformanceProbe!;
    if (
      probe.firstFeedbackMs === undefined ||
      probe.usableStateMs === undefined ||
      probe.renderToInteractiveMs === undefined
    )
      throw new Error('Missing chat probe metrics');
    const result = {
      dataReadyMs: probe.dataReadyMs,
      fetchStartedMs: probe.fetchStartedMs,
      firstFeedbackMs: probe.firstFeedbackMs,
      longTaskCount: probe.longTaskDurations.length,
      maxLongTaskMs: Math.max(0, ...probe.longTaskDurations),
      renderToInteractiveMs: probe.renderToInteractiveMs,
      usableStateMs: probe.usableStateMs,
      nextInput: probe.nextInput,
    };
    probe.dispose();
    return result;
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

function isChatApiRequest(request: Request): boolean {
  const { pathname } = new URL(request.url());
  return pathname === '/api/chat' || pathname.startsWith('/api/chat/');
}

/**
 * Counts in-flight chat-owned API requests (all served by `mockChatBackend`).
 *
 * `networkidle` is not a usable readiness signal on the chat route: the shell
 * sidebar full-prefetches every nav destination (`prefetch={true}`) and warms
 * the Library route plus its release-matrix data ~300ms after mount. Those are
 * real, DB-backed renders of other routes whose duration is not bounded by the
 * chat surface, so on a loaded CI server they can keep the network busy past
 * any timeout (and get aborted mid-stream by the next navigation).
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
  chatApi: ReturnType<typeof trackChatApiRequests>,
  route: string
): Promise<void> {
  // A full route mount makes each sample independent and resets the
  // intentional one-message-per-second composer pacer without sleeping.
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await waitForChatRouteReady(page, chatContent, composer, chatApi);
}

async function exchangeChatRoundTrip(
  page: Page,
  composer: Locator,
  sendButton: Locator,
  userText: string,
  assistantText: string,
  keyboard = false
) {
  await expect(composer).toBeEnabled();
  await installChatProbe(page, userText, assistantText);
  const typing = await page.evaluate(
    value => window.__jovieChatPerformanceProbe!.edit(value),
    userText
  );
  await triggerMeasuredSend(keyboard ? composer : sendButton, keyboard);
  await expect(
    page.getByTestId('chat-user-bubble').filter({ hasText: userText })
  ).toBeVisible();
  await expect(
    page.getByTestId('chat-message-reply').filter({ hasText: assistantText })
  ).toBeVisible();
  const timings = await readChatProbe(page);
  await expect(composer).toHaveValue('Next message');
  await expect(composer).toBeFocused();
  return { ...timings, typing };
}

async function expectPreservedComposer(
  composer: Locator,
  surface: Locator,
  before: { x: number; y: number; width: number; height: number },
  draft: string
) {
  await expect(composer).toHaveValue(draft);
  await expect(composer).toBeFocused();
  await expect
    .poll(async () => {
      const after = await surface.boundingBox();
      return after
        ? Math.max(
            ...(['x', 'y', 'width', 'height'] as const).map(key =>
              Math.abs(after[key] - before[key])
            )
          )
        : Infinity;
    })
    .toBeLessThanOrEqual(1);
}

async function attachFixture(chat: Locator) {
  await chat
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
  await expect(
    chat.locator('[data-upload-state="ready"]').first()
  ).toBeVisible();
}

async function exerciseComposerRecovery(
  page: Page,
  composer: Locator,
  sendButton: Locator,
  chat: Locator,
  backend: Awaited<ReturnType<typeof mockChatBackend>>,
  route: string,
  chatApi: ReturnType<typeof trackChatApiRequests>
) {
  await remountChatRoute(page, chat, composer, chatApi, route);
  await page.evaluate(() => {
    window.__jovieHoldChatResponse = true;
  });
  const copy = roundTripCopy('Performance', 20);
  await exchangeChatRoundTrip(
    page,
    composer,
    sendButton,
    copy.userText,
    copy.assistantText,
    true
  );
  // The response has presented its first content but has not finished.
  expect(
    await page.evaluate(() => typeof window.__jovieReleaseChatResponse)
  ).toBe('function');
  await expect(
    chat.getByRole('button', { name: 'Interrupt and send' })
  ).toBeVisible();
  await attachFixture(chat);
  await installChatProbe(page, 'Unused', 'Unused');
  const streamingEdit = await page.evaluate(() =>
    window.__jovieChatPerformanceProbe!.edit('A draft during streaming')
  );
  expect(streamingEdit.presentedMs).toBeLessThanOrEqual(
    INTERACTION_CLASS_BUDGETS['chat-message-round-trip']
      .renderToInteractiveP95Ms
  );
  // Stop is the mounted action for an empty/whitespace draft; a nonempty draft
  // deliberately changes it to Interrupt and send. Preserve whitespace exactly.
  await page.evaluate(() => window.__jovieChatPerformanceProbe!.edit('  '));
  const surface = chat.getByTestId('chat-composer-surface');
  const beforeCancel = await surface.boundingBox();
  expect(beforeCancel).not.toBeNull();
  await chat
    .getByRole('button', { name: /stop/i })
    .evaluate(button => (button as HTMLButtonElement).click());
  await expect(chat.getByRole('button', { name: /stop/i })).toHaveCount(0);
  await expectPreservedComposer(composer, surface, beforeCancel!, '  ');
  await expect(
    chat.locator('[data-upload-state="ready"]').first()
  ).toBeVisible();
  await page.evaluate(() => window.__jovieChatPerformanceProbe!.dispose());

  await remountChatRoute(page, chat, composer, chatApi, route);
  backend.failNextSend();
  const failed = roundTripCopy('Performance', 21);
  await installChatProbe(page, failed.userText, failed.assistantText);
  await page.evaluate(
    value => window.__jovieChatPerformanceProbe!.edit(value),
    failed.userText
  );
  await triggerMeasuredSend(composer, true);
  const retry = chat.getByRole('button', { name: /retry message/i });
  await expect(retry).toBeVisible();
  // A new draft and attachment must survive retrying the failed turn.
  await page.evaluate(() =>
    window.__jovieChatPerformanceProbe!.edit('Keep this next draft')
  );
  await attachFixture(chat);
  const beforeRetry = await surface.boundingBox();
  expect(beforeRetry).not.toBeNull();
  await installChatProbe(page, 'Unused', 'Unused');
  await retry.evaluate(button => (button as HTMLButtonElement).click());
  await expect(
    chat
      .getByTestId('chat-message-reply')
      .filter({ hasText: failed.assistantText })
  ).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expectPreservedComposer(
    composer,
    surface,
    beforeRetry!,
    'Keep this next draft'
  );
  await expect(
    chat.locator('[data-upload-state="ready"]').first()
  ).toBeVisible();
  await page.evaluate(() => window.__jovieChatPerformanceProbe!.dispose());
}

test.use({ storageState: { cookies: [], origins: [] } });

// Scoped composer coverage; JOV-8717 owns the broader cross-platform matrix.
// Current mounts: ChatComposerSurface chooses hero for empty chat and compact
// for a transcript. The profile route redirects to the same creator chat drawer.
// ThreadComposer is demo-only; InlineChatArea is not a chat composer mount.
const SURFACES = [
  {
    id: 'creator-new',
    route: APP_ROUTES.CHAT,
    persona: 'creator-ready',
    persisted: false,
  },
  {
    id: 'creator-persisted',
    route: `${APP_ROUTES.CHAT}/${CONVERSATION_ID}`,
    persona: 'creator-ready',
    persisted: true,
  },
  {
    id: 'creator-profile-panel',
    route: APP_ROUTES.CHAT_PROFILE_PANEL,
    persona: 'creator-ready',
    persisted: false,
  },
  {
    id: 'ovie',
    route: APP_ROUTES.ADMIN_CHAT,
    persona: 'admin',
    persisted: false,
  },
] as const;
const LAYOUTS = [
  { id: 'desktop', width: 1280, height: 480 },
  { id: 'phone', width: 390, height: 844 },
] as const;

async function runComposerProfile(
  page: Page,
  testInfo: TestInfo,
  surface: (typeof SURFACES)[number],
  layout: (typeof LAYOUTS)[number]
) {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(300_000);
  await page.setViewportSize(layout);

  const backend = await mockChatBackend(page, surface.persisted);
  const chatApi = trackChatApiRequests(page);
  await setTestAuthBypassSession(page, surface.persona, 'e2e-chat-performance');
  await page.goto(surface.route, { waitUntil: 'domcontentloaded' });

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
      await remountChatRoute(
        page,
        chatContent,
        composer,
        chatApi,
        surface.route
      );
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

  // Warmup sends are real product interactions and land in the UX latency
  // store. Drop them so the assertion below still proves exactly the scored
  // samples were recorded.
  await page.evaluate(storageKey => {
    localStorage.removeItem(storageKey);
  }, UX_LATENCY_STORAGE_KEY);

  const samples: InteractionLatencySample[] = [];
  const typingSamples: number[] = [];

  for (let runIndex = 0; runIndex < SAMPLE_COUNT; runIndex += 1) {
    await remountChatRoute(page, chatContent, composer, chatApi, surface.route);
    const copy = roundTripCopy('Performance', runIndex);
    const timings = await exchangeChatRoundTrip(
      page,
      composer,
      sendButton,
      copy.userText,
      copy.assistantText,
      runIndex % 2 === 0
    );
    typingSamples.push(timings.typing.presentedMs);
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
  const report = buildInteractionLatencyReport({
    samples: completeSamples,
    metadata: { viewport: layout.id, sampleCount: SAMPLE_COUNT },
  });

  await testInfo.attach('chat-performance-report.json', {
    body: JSON.stringify(
      {
        ...report,
        profile: {
          surface: surface.id,
          layout: layout.id,
          browser: testInfo.project.name,
          measurementVersion: 2,
        },
        typingPresentedMs: typingSamples,
      },
      null,
      2
    ),
    contentType: 'application/json',
  });

  const budget = INTERACTION_CLASS_BUDGETS['chat-message-round-trip'];
  // Keep the existing ceilings, including feedback p95 (the shared evaluator's
  // independent enforcement repair belongs to JOV-8717).
  expect(
    percentile(
      samples.map(sample => sample.firstFeedbackMs),
      95
    )
  ).toBeLessThanOrEqual(budget.firstFeedbackP95Ms);
  expect(percentile(typingSamples, 95)).toBeLessThanOrEqual(
    budget.renderToInteractiveP95Ms
  );
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
  await exerciseComposerRecovery(
    page,
    composer,
    sendButton,
    chatContent,
    backend,
    surface.route,
    chatApi
  );
}

for (const surface of SURFACES) {
  for (const layout of LAYOUTS) {
    test(`${surface.id} ${layout.id} composer stays within the responsiveness budget`, async ({
      page,
    }, testInfo) => {
      await runComposerProfile(page, testInfo, surface, layout);
    });
  }
}
