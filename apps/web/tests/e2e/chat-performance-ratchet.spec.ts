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
import { CHAT_TRANSCRIPT_WINDOW } from '@/lib/chat/transcript-window';
import { UX_LATENCY_STORAGE_KEY } from '@/lib/monitoring/interaction-latency';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '@/scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/auth';
import { roundTripCopy } from '../helpers/chat-performance-probe';
import {
  exchangeChatRoundTrip,
  measureChatScrollFrames,
  mockChatBackend,
  remountChatRoute,
  SAMPLE_COUNT,
  trackChatApiRequests,
  WARMUP_ROUND_TRIPS,
  waitForChatRouteReady,
} from '../helpers/chat-performance-scenario';

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
      waitForQuietFrames
    );
    samples.push({
      ...timings,
      runIndex,
      scenarioId: 'chat-message-round-trip',
    });
  }

  await waitForQuietFrames(page);
  const { droppedFrameCount } = await measureChatScrollFrames(
    page,
    waitForQuietFrames
  );
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
