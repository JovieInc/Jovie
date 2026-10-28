import { expect, test } from '@playwright/test';

/**
 * LCP guard for the artist entry routes (budget: apps/web/performance-entry-budgets.json).
 *
 * The throttled-mobile gate read /start at 7.9s because the real page streamed behind a
 * loading.tsx Suspense boundary that React reveals from a throttled script. The heading
 * that is the LCP element must be in the first HTML, outside any streamed boundary.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('start renders its heading in the first HTML, not behind a loading boundary', async ({
  request,
}) => {
  const response = await request.get('/start');
  expect(response.ok()).toBe(true);
  const html = await response.text();

  expect(html).toContain('What are you working on?');
  expect(html).not.toContain('data-testid="start-loading-skeleton"');
  expect(html).not.toMatch(/<template id="B:\d+"><\/template>/);
});
