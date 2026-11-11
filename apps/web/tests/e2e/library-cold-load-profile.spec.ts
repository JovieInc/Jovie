/**
 * Diagnostic: where a cold /app/library load spends its main thread.
 *
 * The production product crawl still sees a 216 to 247 ms frozen frame on
 * signed-in /app/library and /app/releases (which redirects there), on the
 * median of 3 loads, after the chat fix cleared /app/chat. Production serves
 * no source maps, so it cannot name the component. This smoke build does, so
 * this prints self time by original source file and function. It asserts only
 * that the Library surface rendered; no budget reads the numbers.
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

test('cold library load prints a source-mapped CPU profile', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-library-profile');

  await printColdLoadProfile(page, 'library cold load', async () => {
    await page.goto('/app/library', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('library-surface').first()).toBeVisible({
      timeout: 30_000,
    });
    // The production long frame can land after first paint, once data arrives.
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => undefined);
  });
  await printServerDomWeight(page, 'library cold load');
});
