import { expect, type Page, test } from '@playwright/test';
import { fillControlledInputUntilEnabled } from '../helpers/auth';

/**
 * Production synthetic guard for the /start bot-check fail-open (JOV-10194).
 *
 * The invisible Turnstile widget cannot run in headless Chrome, Instagram's
 * iOS webview, or script-blocking browsers, and those visitors used to be
 * dead-ended with "We couldn't start your chat". Since JOV-10194 the client
 * sends the fail-open marker token (widget hard failure or the 8s wait) and
 * the server admits the first message on the unverified budget.
 *
 * This spec reproduces both incident UA classes against production with NO
 * passage token — it deliberately exercises the marker path, not the
 * sanctioned agent path — and asserts the first assistant reply is reached.
 *
 * Budget note: one admission per test, at most 2 per 6-hourly run from one
 * runner IP (per-IP budget is 4/hour, global 120/hour).
 *
 * @synthetic @start-chat
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
    test.skip(
      true,
      'synthetic-start-chat only runs when E2E_SYNTHETIC_MODE=true.'
    );
  }
});

const ORIGIN = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'https://jov.ie';

const INSTAGRAM_IOS_WEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ' +
  'Instagram 335.0.4.28.90 (iPhone14,2; iOS 18_1; en_US; en-US; ' +
  'scale=3.00; 1125x2436)';

async function sendFirstMessageAndAwaitReply(page: Page): Promise<void> {
  test.setTimeout(150_000);

  await page.goto(`${ORIGIN}/start`, { waitUntil: 'domcontentloaded' });
  const input = page.locator('[aria-label="Chat message input" i]');
  const sendButton = page.getByRole('button', { name: 'Send message' });

  await expect(input).toBeVisible({ timeout: 30_000 });
  await fillControlledInputUntilEnabled(
    input,
    sendButton,
    'Help me set up my artist page'
  );

  // The held send fails open after at most 8s; the marker admission (or a
  // real token, if the widget happens to succeed) must still return 200.
  const [response] = await Promise.all([
    page.waitForResponse(
      candidate =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/chat',
      { timeout: 90_000 }
    ),
    sendButton.click(),
  ]);

  if (response.status() !== 200) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `First /api/chat message HTTP ${response.status()} ${body.slice(0, 200)}`
    );
  }

  await expect(page.getByText("We couldn't start your chat")).toHaveCount(0);
  // First assistant reply: a Jovie speaker row opens the assistant turn.
  await expect(
    page.locator('[data-testid="onboarding-speaker-row"]').first()
  ).toBeVisible({ timeout: 60_000 });
}

test.describe('desktop Chrome (headless)', () => {
  test('a headless-Chrome first message reaches the first assistant reply', async ({
    page,
  }) => {
    await sendFirstMessageAndAwaitReply(page);
  });
});

test.describe('Instagram iOS webview', () => {
  test.use({
    userAgent: INSTAGRAM_IOS_WEBVIEW_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('an Instagram iOS webview first message reaches the first assistant reply', async ({
    page,
  }) => {
    await sendFirstMessageAndAwaitReply(page);
  });
});
