/**
 * Deploy-gating chat responsiveness ratchet (JOV-3887).
 *
 * The backend is deterministic so this test isolates browser rendering and
 * interaction latency on the real authenticated chat route. Network/provider
 * latency is covered separately by production telemetry.
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { UX_LATENCY_STORAGE_KEY } from '@/lib/monitoring/interaction-latency';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '@/scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/auth';
import { roundTripCopy } from '../helpers/chat-performance-probe';
import {
  exchangeChatRoundTrip,
  measureDroppedScrollFrames,
  mockChatBackend,
  remountChatRoute,
  SAMPLE_COUNT,
  trackChatApiRequests,
  WARMUP_ROUND_TRIPS,
  waitForChatRouteReady,
} from '../helpers/chat-performance-scenario';

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

  // Warmup sends are real product interactions and land in the UX latency
  // store. Drop them so the assertion below still proves exactly the scored
  // samples were recorded.
  await page.evaluate(storageKey => {
    localStorage.removeItem(storageKey);
  }, UX_LATENCY_STORAGE_KEY);

  const samples: InteractionLatencySample[] = [];

  for (let runIndex = 0; runIndex < SAMPLE_COUNT; runIndex += 1) {
    await remountChatRoute(page, chatContent, composer, chatApi);
    const copy = roundTripCopy('Performance', runIndex);
    const timings = await exchangeChatRoundTrip(
      page,
      composer,
      sendButton,
      copy.userText,
      copy.assistantText
    );
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
