import { expect, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import {
  isClerkRedirectUrl,
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
} from './utils/smoke-test-utils';

const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const AUTHENTICATED_APP_SHELL_NAVIGATION_TIMEOUT = 120_000;
const AUTHENTICATED_APP_SHELL_NAVIGATION_RETRIES = 0;
const WELCOME_CHAT_BOOTSTRAP_REQUEST_TIMEOUT = 30_000;
const AUTHENTICATED_WELCOME_CHAT_SMOKE_BUFFER = 10_000;
const AUTHENTICATED_WELCOME_CHAT_SMOKE_TIMEOUT =
  AUTHENTICATED_APP_SHELL_NAVIGATION_TIMEOUT +
  WELCOME_CHAT_BOOTSTRAP_REQUEST_TIMEOUT +
  SMOKE_TIMEOUTS.URL_STABLE +
  SMOKE_TIMEOUTS.VISIBILITY +
  AUTHENTICATED_WELCOME_CHAT_SMOKE_BUFFER;

test.describe('Signup Funnel Smoke @smoke', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signup handles claim params without server errors', async ({
    page,
  }) => {
    await page.route('**/api/handle/check*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      })
    );

    const response = await smokeNavigateWithRetry(
      page,
      '/signup?handle=SmokeArtist&plan=founding&redirect_url=%2Fonboarding%3Fhandle%3Dsmokeartist',
      {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        retries: 2,
      }
    );

    expect(response?.status() ?? 0).toBeLessThan(500);
    if (isClerkRedirectUrl(page.url())) {
      test.skip(
        true,
        'Clerk preview handshake took over unauthenticated signup smoke'
      );
      return;
    }
    await expect(page).toHaveURL(/\/signup/);
    await expect(
      page.locator('body'),
      'Signup body rendered an application error'
    ).not.toContainText(/application error|internal server error/i);
    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get('handle')).toBe('SmokeArtist');
    expect(currentUrl.searchParams.get('plan')).toBe('founding');
    expect(currentUrl.searchParams.get('redirect_url')).toContain(
      '/onboarding'
    );
  });

  test('unauthenticated onboarding deep links land on the canonical chat front door', async ({
    page,
  }) => {
    const response = await smokeNavigateWithRetry(
      page,
      '/onboarding?handle=smokeartist',
      {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        retries: 2,
      }
    );

    expect(response?.status() ?? 0).toBeLessThan(500);
    if (isClerkRedirectUrl(page.url())) {
      test.skip(
        true,
        'Clerk preview handshake took over unauthenticated onboarding redirect smoke'
      );
      return;
    }
    await expect(page).toHaveURL(/\/start\?/, {
      timeout: SMOKE_TIMEOUTS.URL_STABLE,
    });

    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe('/start');
    expect(finalUrl.searchParams.get('handle')).toBe('smokeartist');
  });

  test('authenticated creator shell and welcome chat bootstrap stay healthy under auth bypass', async ({
    page,
  }) => {
    test.setTimeout(AUTHENTICATED_WELCOME_CHAT_SMOKE_TIMEOUT);

    if (!USE_TEST_AUTH_BYPASS) {
      test.skip(true, 'Run with E2E_USE_TEST_AUTH_BYPASS=1');
      return;
    }

    await setTestAuthBypassSession(
      page,
      'creator-ready',
      'e2e-signup-funnel-smoke-user'
    );

    const appResponse = await smokeNavigateWithRetry(page, '/app/chat', {
      timeout: AUTHENTICATED_APP_SHELL_NAVIGATION_TIMEOUT,
      retries: AUTHENTICATED_APP_SHELL_NAVIGATION_RETRIES,
    });

    expect(appResponse?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveURL(/\/app\/chat/, {
      timeout: SMOKE_TIMEOUTS.URL_STABLE,
    });
    await expect(
      page.locator('body'),
      'Authenticated app shell rendered an error boundary'
    ).not.toContainText(
      /application error|internal server error|something went wrong/i
    );

    const bootstrapResponse = await page.request.post(
      '/api/onboarding/welcome-chat',
      {
        data: { initialReply: 'Smoke test bootstrap' },
        timeout: WELCOME_CHAT_BOOTSTRAP_REQUEST_TIMEOUT,
      }
    );

    expect([200, 201]).toContain(bootstrapResponse.status());
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      route?: string;
      conversationId?: string;
      success?: boolean;
    };

    expect(bootstrapPayload.success).toBe(true);
    expect(bootstrapPayload.conversationId).toBeTruthy();
    expect(bootstrapPayload.route ?? '').toMatch(
      /^\/app\/chat\/.+\?panel=profile&from=onboarding$/
    );
  });
});
