/**
 * Diagnostic: where a cold /app/chat load spends its main thread (JOV-10150).
 *
 * The production cert sees one ~265 ms React render on cold chat loads but
 * cannot name the component, because production serves no source maps. This
 * smoke build does, so this prints self time by original source file and
 * function. It asserts only that the chat surface rendered; no budget reads
 * the numbers.
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  printColdLoadProfile,
  printServerDomWeight,
} from './utils/cold-load-profile';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test('cold chat load prints a source-mapped CPU profile', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-chat-profile');

  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'blink.user_timing', 'blink.console'],
  });
  await printColdLoadProfile(page, 'chat cold load', async () => {
    await page.goto('/app/chat', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('chat-content').last()).toBeVisible({
      timeout: 30_000,
    });
    // The production long frame can land after first paint, once data arrives.
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => undefined);
  });
  const trace = JSON.parse((await browser.stopTracing()).toString()) as {
    traceEvents: {
      name: string;
      ts: number;
      dur?: number;
      args?: { data?: Record<string, unknown> };
    }[];
  };
  const stamps = trace.traceEvents.filter(event => event.name === 'TimeStamp');
  const tracks = new Map<string, number>();
  const byComponent = new Map<
    string,
    { total: number; max: number; n: number }
  >();
  for (const event of stamps) {
    const data = event.args?.data ?? {};
    const track = String(data.track ?? data.trackName ?? '');
    tracks.set(track, (tracks.get(track) ?? 0) + 1);
    const start = Number(data.start);
    const end = Number(data.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const name = `${String(data.message ?? data.name)} [${track}]`;
    const ms = end - start;
    const row = byComponent.get(name) ?? { total: 0, max: 0, n: 0 };
    byComponent.set(name, {
      total: row.total + ms,
      max: Math.max(row.max, ms),
      n: row.n + 1,
    });
  }
  process.stdout.write(
    `[react-tracks] ${stamps.length} TimeStamp events; tracks ${JSON.stringify([...tracks])}\n` +
      `[react-tracks] sample ${JSON.stringify(stamps.slice(0, 3).map(event => event.args?.data))}\n` +
      [...byComponent]
        .sort((a, b) => b[1].max - a[1].max)
        .slice(0, 40)
        .map(
          ([name, row]) =>
            `  max ${Math.round(row.max)}ms total ${Math.round(row.total)}ms x${row.n} ${name}`
        )
        .join('\n') +
      '\n'
  );
  await printServerDomWeight(page, 'chat cold load');
});
