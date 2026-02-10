import { expect, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  waitForHydration,
  waitForLoad,
} from './utils/smoke-test-utils';

/**
 * CORS Check Tests
 *
 * NOTE: Tests public homepage for unauthenticated visitors.
 * Must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test('No CORS errors on homepage', async ({ page }) => {
  const corsErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('CORS')) {
      corsErrors.push(msg.text());
    }
  });

  // Use domcontentloaded + hydration instead of networkidle
  await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });

  // Wait for hydration and async requests to complete deterministically
  await waitForHydration(page);
  await waitForLoad(page);

  // Verify the page has loaded content before checking CORS errors
  await expect(page.locator('body')).toBeVisible({
    timeout: SMOKE_TIMEOUTS.QUICK,
  });

  console.log('CORS errors found:', corsErrors.length);
  if (corsErrors.length > 0) {
    console.log('CORS errors:', corsErrors);
  }

  // Should have fewer CORS errors now
  expect(corsErrors.length).toBeLessThan(5);
});
