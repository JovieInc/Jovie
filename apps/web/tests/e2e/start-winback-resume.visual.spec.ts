import type { Page } from '@playwright/test';
import { expect, test } from './setup';

/**
 * Visual evidence for the /start win-back resume route.
 * An unknown resume token must land on the same anonymous path as a plain
 * /start visit. A valid token is covered by the route unit tests.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function landingPath(page: Page, path: string): Promise<string> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => undefined);
  return new URL(page.url()).pathname;
}

test('unknown winback resume token keeps the anonymous start landing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const plain = await landingPath(page, '/start');
  const unknown = await landingPath(
    page,
    '/start?resume=winback&w=not-a-real-token'
  );

  expect(unknown).toBe(plain);
  expect(plain.length).toBeGreaterThan(0);
});
