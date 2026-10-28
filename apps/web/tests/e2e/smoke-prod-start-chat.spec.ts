import { expect, test } from '@playwright/test';

/**
 * Production-only /start chat-start proof (JOV-9624). A 200 from /start does
 * not establish that a visitor can begin a conversation: the first send waits
 * on a Turnstile token and then POSTs /api/chat. This spec sends one message
 * as an anonymous visitor and requires the send request to be issued, to
 * return 2xx, and the "We couldn't start your chat" banner to stay absent.
 *
 * Failure messages carry the Turnstile error codes so a bot-detection reject
 * (600010 under automation flags) is distinguishable from a real regression.
 * It never touches the Turnstile gate, so public bot protection is unchanged.
 * One LLM turn per run; no account or customer-visible data is created.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('anonymous /start sends the first message and gets a chat response @production-smoke', async ({
  page,
}) => {
  const baseUrl = process.env.BASE_URL;
  const expectedSha = process.env.EXPECTED_COMMIT_SHA;
  test.skip(
    baseUrl !== 'https://jov.ie' || !expectedSha,
    'Requires an explicit production target and expected commit SHA'
  );
  expect(baseUrl).toBe('https://jov.ie');
  expect(expectedSha).toMatch(/^[0-9a-f]{40}$/);
  test.setTimeout(120_000);

  const buildInfo = await page.request.get('/api/health/build-info', {
    headers: { 'Cache-Control': 'no-cache' },
  });
  expect(buildInfo.status()).toBe(200);
  expect(((await buildInfo.json()) as { commitSha?: string }).commitSha).toBe(
    expectedSha
  );

  const turnstileErrorCodes = new Set<string>();
  page.on('console', message => {
    if (!message.text().includes('[Cloudflare Turnstile]')) return;
    for (const match of message.text().matchAll(/\b\d{6}\b/g)) {
      turnstileErrorCodes.add(match[0]);
    }
  });

  await page.goto('/start', { waitUntil: 'domcontentloaded' });
  const composer = page.getByRole('textbox').first();
  await expect(composer).toBeVisible();

  const chatResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/chat' &&
      response.request().method() === 'POST',
    { timeout: 60_000 }
  );
  await composer.fill('I make music in Austin');
  await composer.press('Enter');

  const startError = page.getByText("We couldn't start your chat");
  let response;
  try {
    response = await chatResponse;
  } catch {
    const banner = (await startError.count()) > 0;
    throw new Error(
      `No /api/chat request after send; startErrorBanner=${banner}; turnstileErrorCodes=${[...turnstileErrorCodes].join(',') || 'none'}`
    );
  }
  expect(
    response.status(),
    `/api/chat status; turnstileErrorCodes=${[...turnstileErrorCodes].join(',') || 'none'}`
  ).toBeLessThan(300);
  await expect(startError).toHaveCount(0);
});
