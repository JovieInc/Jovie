/**
 * E2E smoke: chat jank monitor doesn't crash the page.
 *
 * The monitor is covered by ~31 unit tests. This e2e is a minimal
 * regression guard: with the feature flag forced on via the localStorage
 * override (`code:CHAT_JANK_MONITOR`), the chat page must still render,
 * the composer must still be interactive, and there must be no uncaught
 * errors from the monitor code path.
 *
 * We intentionally do NOT mock the SSE stream — the AI SDK v6 UIMessage
 * wire format is implementation-dependent and would produce a flaky e2e.
 * Snapshot-level behavior (duplicates, disappear, reorder, rollback,
 * stall, feedback latency) is exercised in tests/unit/chat/*.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test chat-jank --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator&redirect=/app/chat';

test.use({ storageState: { cookies: [], origins: [] } });

test('chat page renders with jank monitor flag forced on', async ({ page }) => {
  test.setTimeout(120_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Bypass auth + navigate to /app/chat
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  // The bypass responds with a 303 and the browser follows to /app/chat
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  // Flip the jank-monitor flag on via the dev localStorage override, then reload
  await page.evaluate(() => {
    globalThis.localStorage.setItem('code:CHAT_JANK_MONITOR', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Chat content root (see data-testid='chat-content' in JovieChat.tsx)
  await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
    timeout: 30_000,
  });

  // Composer should be interactive
  const composer = page
    .getByPlaceholder(/ask jovie|ask a follow-up|chat message/i)
    .first();
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.click();
  await composer.fill('hello from the jank smoke test');

  // A brief settle so any jank monitor effects run without crashing
  await page.waitForTimeout(500);

  // Filter out benign noise we do not control from the smoke gate
  const ignorable = [
    /clerk|handshake|dev-browser/i,
    /sentry/i,
    /favicon/i,
    /non-passive event listener/i,
    /ResizeObserver loop/i,
  ];
  const relevant = consoleErrors.filter(e => !ignorable.some(rx => rx.test(e)));
  expect(relevant, `Unexpected console errors: ${relevant.join('\n')}`).toEqual(
    []
  );
});
