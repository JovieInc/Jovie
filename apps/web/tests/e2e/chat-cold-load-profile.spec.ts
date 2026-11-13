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

test('cold chat load prints a source-mapped CPU profile', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-chat-profile');

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
  await printServerDomWeight(page, 'chat cold load');
});
