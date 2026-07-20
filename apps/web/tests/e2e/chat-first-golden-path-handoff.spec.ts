import { expect, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { waitForHydration } from './utils/smoke-test-utils';

const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const CHAT_PANEL = '[data-testid="onboarding-chat"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';

const IGNORABLE_CONSOLE_ERRORS = [
  /favicon/i,
  /ResizeObserver loop/i,
  /eval\(\) is not supported.*React requires eval/i,
] as const;

function collectConsoleFailures(page: import('@playwright/test').Page) {
  const failures: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const location = msg.location().url;
      failures.push(location ? `${msg.text()} (${location})` : msg.text());
    }
  });
  page.on('pageerror', error => {
    failures.push(error.message);
  });
  return failures;
}

function relevantConsoleFailures(failures: readonly string[]) {
  return failures.filter(
    failure => !IGNORABLE_CONSOLE_ERRORS.some(pattern => pattern.test(failure))
  );
}

test.describe('Chat-first golden path handoff @golden-path', () => {
  test.setTimeout(360_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    page.setDefaultNavigationTimeout(240_000);
  });

  test('authenticated welcome-chat bootstrap returns onboarding route with zero console errors', async ({
    page,
  }) => {
    test.skip(!USE_TEST_AUTH_BYPASS, 'Run with E2E_USE_TEST_AUTH_BYPASS=1');

    const consoleFailures = collectConsoleFailures(page);
    await setTestAuthBypassSession(
      page,
      'creator-ready',
      'e2e-chat-first-golden-path'
    );

    const bootstrapResponse = await page.request.post(
      '/api/onboarding/welcome-chat',
      {
        data: { initialReply: 'Ready to build my profile' },
        timeout: 60_000,
      }
    );

    expect([200, 201]).toContain(bootstrapResponse.status());
    const payload = (await bootstrapResponse.json()) as {
      route?: string;
      conversationId?: string;
      success?: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.conversationId).toBeTruthy();
    expect(payload.route ?? '').toMatch(
      /^\/app\/chat\/.+\?panel=profile&from=onboarding$/
    );

    await page.goto(payload.route ?? '/app/chat', {
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);

    await expect(page).toHaveURL(
      /\/app\/chat\/.+\?panel=profile&from=onboarding/
    );
    await expect(page.locator('body')).not.toContainText(
      /application error|internal server error|something went wrong/i
    );
    await expect(page.getByLabel('Chat Message Input')).toBeVisible({
      timeout: 90_000,
    });

    expect(
      relevantConsoleFailures(consoleFailures),
      `Unexpected console failures: ${consoleFailures.join('\n')}`
    ).toEqual([]);
  });

  test('/start exposes accessible onboarding chat landmarks without console errors', async ({
    page,
  }) => {
    const consoleFailures = collectConsoleFailures(page);

    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(page.locator(CHAT_PANEL)).toBeVisible();
    await expect(page.getByLabel('Jovie onboarding chat')).toBeVisible();
    await expect(page.locator(COMPOSER_TEXTAREA)).toBeVisible();
    await expect(page.locator(COMPOSER_TEXTAREA)).toHaveAttribute(
      'aria-label',
      'Chat Message Input'
    );

    expect(
      relevantConsoleFailures(consoleFailures),
      `Unexpected /start console failures: ${consoleFailures.join('\n')}`
    ).toEqual([]);
  });
});
