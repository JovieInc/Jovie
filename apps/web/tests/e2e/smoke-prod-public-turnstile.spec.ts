import { expect, test } from '@playwright/test';

/**
 * Production-only public subscription proof. A successful HTTP response does
 * not establish that Turnstile issued a token or that visitors can subscribe.
 * No email is submitted, so this does not create a production subscriber.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('changelog subscription becomes usable with a real Turnstile token @production-smoke', async ({
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

  const buildInfo = await page.request.get('/api/health/build-info', {
    headers: { 'Cache-Control': 'no-cache' },
  });
  expect(buildInfo.status()).toBe(200);
  const build = (await buildInfo.json()) as { commitSha?: string };
  expect(build.commitSha).toBe(expectedSha);

  const turnstileErrorCodes = new Set<string>();
  let failedChallengeRequests = 0;
  page.on('console', message => {
    if (!message.text().includes('[Cloudflare Turnstile]')) return;
    for (const match of message.text().matchAll(/\b\d{6}\b/g)) {
      turnstileErrorCodes.add(match[0]);
    }
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).hostname === 'challenges.cloudflare.com') {
      failedChallengeRequests += 1;
    }
  });

  const response = await page.goto('/changelog', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(200);
  const form = page.getByTestId('changelog-subscribe-form');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('invisible-turnstile-widget')).toHaveCount(1);

  const responseField = form.locator('[name="cf-turnstile-response"]');
  await expect(responseField).toHaveCount(1);
  try {
    await expect
      .poll(
        async () =>
          responseField.evaluate(
            input => (input as HTMLInputElement).value.length
          ),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
  } catch {
    const alert = await page
      .locator('#changelog-subscribe [role="alert"]')
      .textContent()
      .catch(() => null);
    throw new Error(
      `Turnstile did not issue a token on /changelog; alert=${alert?.trim() || 'none'}; errorCodes=${[...turnstileErrorCodes].join(',') || 'none'}; failedChallengeRequests=${failedChallengeRequests}`
    );
  }
  await expect(form.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  await expect(page.locator('#changelog-subscribe [role="alert"]')).toHaveCount(
    0
  );
});
