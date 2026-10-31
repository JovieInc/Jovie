import { devices, expect, type Page, test } from '@playwright/test';

/**
 * Scheduled production guard: a person can start a chat on /start.
 *
 * Runs as an ordinary visitor (no passage token, no bypass), once as desktop
 * Chrome and once as the Instagram in-app browser on iPhone, the way artists
 * arrive from an IG bio link. A headless runner usually fails Turnstile, so
 * this is exactly the "check could not complete" path real privacy browsers
 * and webviews hit: the chat must still start on the unverified budget and
 * the page must never show a dead end. Each run spends at most two
 * unverified starts (retries are capped at one so a red run stays inside
 * the 4-per-IP hourly budget). Failures page #alerts-production and file the
 * synthetic Linear issue through the monitoring workflow.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ retries: 1 });

const INSTAGRAM_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.28.109 (iPhone15,3; iOS 18_1; en_US; en; scale=3.00; 1290x2796; 665179837)';

const DEAD_END_COPY =
  /couldn.t start your chat|cannot complete the security check|taking longer than expected/i;

async function startChat(page: Page) {
  await page.goto('/start', { waitUntil: 'domcontentloaded' });
  const composer = page.getByRole('textbox').first();
  await expect(composer).toBeVisible();
  const chatResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/chat' &&
      response.request().method() === 'POST',
    // Fail-open waits at most 8s on the check, then sends.
    { timeout: 45_000 }
  );
  await composer.fill('I make music in Austin');
  await composer.press('Enter');
  const response = await chatResponse;
  const body = response.ok() ? '' : await response.text().catch(() => '');
  expect(
    response.status(),
    `/api/chat must start the chat; body=${body.slice(0, 300)}`
  ).toBeLessThan(300);
  await expect(page.getByText(DEAD_END_COPY)).toHaveCount(0);
}

test.describe('start chat as desktop Chrome @synthetic', () => {
  test.use({ userAgent: devices['Desktop Chrome'].userAgent });
  test('a visitor starts a chat with no dead end', async ({ page }) => {
    await startChat(page);
  });
});

test.describe('start chat in the Instagram iOS webview @synthetic', () => {
  test.use({
    viewport: devices['iPhone 15'].viewport,
    deviceScaleFactor: devices['iPhone 15'].deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: INSTAGRAM_IOS_UA,
  });
  test('an artist from an IG bio link starts a chat with no dead end', async ({
    page,
  }) => {
    await startChat(page);
  });
});
