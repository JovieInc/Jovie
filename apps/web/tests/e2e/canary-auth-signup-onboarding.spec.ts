/**
 * Auth / signup / onboarding golden-path canary (JOV-1871)
 *
 * Deterministic regression net for the anonymous auth + onboarding entrypoints.
 * Runs nightly in CI. Every check corresponds to a real production regression
 * risk on the signup → onboarding funnel.
 *
 * Bug → Detector mapping:
 *  Deploy canary auth/onboarding probes     → signup/signin/start render checks
 *  ONBOARDING_CHAT_DISABLED runtime gate    → onboarding chat gate probe
 *  Clerk / Turnstile config regressions     → auth shell ready + config error scan
 *
 * Anonymous visitor — no auth required.
 *
 * @canary @nightly @auth-signup-onboarding
 */

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  buildOnboardingChatProbePayload,
  evaluateOnboardingChatProbe,
} from '@/lib/canaries/auth-signup-onboarding';
import { AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES } from './fixtures/canary-auth-signup-onboarding';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  waitForHydration,
} from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const AUTH_UNAVAILABLE_PATTERN =
  /auth unavailable|authentication unavailable|temporarily unavailable|clerk is not configured|turnstile is not configured/i;

async function allowAnalyticsPassthrough(page: Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

function collectHydrationErrors(page: Page): {
  messages: string[];
  cleanup: () => void;
} {
  const messages: string[] = [];

  const handler = (msg: import('@playwright/test').ConsoleMessage) => {
    const text = msg.text();
    if (
      text.includes('Hydration failed') ||
      text.includes('hydration mismatch') ||
      text.includes('Text content does not match') ||
      text.includes('did not match') ||
      (text.includes('Warning: ') && text.includes('server rendered HTML'))
    ) {
      messages.push(text);
    }
  };

  page.on('console', handler);
  return {
    messages,
    cleanup: () => page.off('console', handler),
  };
}

async function goAndWait(
  page: Page,
  path: string
): Promise<{ status: number; ok: boolean }> {
  const response = await smokeNavigate(page, path, {
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  const status = response?.status() ?? 0;
  if (status < 200 || status >= 400) {
    return { status, ok: false };
  }
  await waitForHydration(page);
  return { status, ok: true };
}

async function assertAuthShellReady(page: Page, mode: 'sign-in' | 'sign-up') {
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(AUTH_UNAVAILABLE_PATTERN);

  const shell = page.locator(
    `[data-auth-shell-mode="${mode}"][data-auth-shell-ready="true"]`
  );
  await expect(
    shell,
    `AuthShell did not signal ready for mode=${mode}`
  ).toBeVisible({ timeout: 30_000 });

  await expect(page.locator('input[type="password"]')).toHaveCount(0);
}

test.describe('Auth signup onboarding canary', () => {
  test('signup /signup renders the owned auth shell', async ({ page }) => {
    test.setTimeout(90_000);
    await allowAnalyticsPassthrough(page);

    const hydrationErrors = collectHydrationErrors(page);
    const { status, ok } = await goAndWait(
      page,
      AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES.signup
    );

    expect(ok, `/signup returned ${status}`).toBe(true);
    await assertAuthShellReady(page, 'sign-up');

    hydrationErrors.cleanup();
    expect(hydrationErrors.messages).toHaveLength(0);
  });

  test('signin /signin renders the owned auth shell', async ({ page }) => {
    test.setTimeout(90_000);
    await allowAnalyticsPassthrough(page);

    const { status, ok } = await goAndWait(
      page,
      AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES.signin
    );

    expect(ok, `/signin returned ${status}`).toBe(true);
    await assertAuthShellReady(page, 'sign-in');
  });

  test('start /start initializes the onboarding interview', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await allowAnalyticsPassthrough(page);

    // Deterministic (no-LLM) signals that the interview actually initialized.
    // The original canary only asserted the `onboarding-chat` container was in
    // the DOM, so the production break — interview never starts / composer never
    // becomes usable — slipped through. These assertions are the gated lane's
    // "CI fails if the interview does not initialize" contract.
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    // Uncaught JS exceptions are always app errors. console.error is noisier:
    // browser CSP-policy violation reports are surfaced as console errors but
    // are orthogonal to whether the interview initializes, so they are captured
    // (for the failure packet) but excluded from the gating subset below.
    const isBenignConsoleNoise = (text: string) =>
      /content security policy|violates the following|was preloaded using link preload/i.test(
        text
      );
    page.on('pageerror', err =>
      consoleErrors.push(`pageerror: ${err.message}`)
    );
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => {
      const url = req.url();
      // Only critical requests: the chat API, app JS, and the document itself.
      if (/\/api\/chat|\/_next\/static\/.+\.js|\/start/.test(url)) {
        failedRequests.push(`${req.method()} ${url}`);
      }
    });

    // Attach the captured signals on every run so the failure-packet reporter
    // can surface them even when an assertion below fails first.
    const attachSignals = async () => {
      await testInfo.attach('journey-console-errors', {
        body: JSON.stringify(consoleErrors),
        contentType: 'application/json',
      });
      await testInfo.attach('journey-failed-requests', {
        body: JSON.stringify(failedRequests),
        contentType: 'application/json',
      });
    };

    try {
      const { status, ok } = await goAndWait(
        page,
        AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES.start
      );
      expect(ok, `/start returned ${status}`).toBe(true);

      // Container present...
      await expect(page.getByTestId('onboarding-chat')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // ...AND the interview initialized: the starter intro/suggestions render.
      await expect(
        page.getByTestId('onboarding-empty-intro'),
        'onboarding interview never initialized its starter prompt'
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      // ...AND the visitor can actually answer: the composer input is enabled.
      const composer = page.getByRole('textbox', {
        name: /chat message input/i,
      });
      await expect(
        composer,
        'onboarding composer never became editable (stuck loading)'
      ).toBeEditable({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      // No silent breakage behind a rendered shell. Gate on real app errors;
      // browser CSP-policy reports are captured (packet) but not gated.
      const gatingErrors = consoleErrors.filter(e => !isBenignConsoleNoise(e));
      expect(gatingErrors, 'uncaught app errors on /start').toHaveLength(0);
      expect(failedRequests, 'critical requests failed on /start').toHaveLength(
        0
      );
    } finally {
      await attachSignals();
    }
  });

  test('onboarding chat POST reaches Turnstile gate', async ({ page }) => {
    test.setTimeout(60_000);
    await allowAnalyticsPassthrough(page);

    const { ok } = await goAndWait(
      page,
      AUTH_SIGNUP_ONBOARDING_SPEC_ROUTES.start
    );
    expect(ok).toBe(true);

    const result = await page.evaluate(async payload => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.text() };
    }, buildOnboardingChatProbePayload());

    const evaluation = evaluateOnboardingChatProbe(result.status, result.body);
    expect(
      evaluation.ok,
      evaluation.detail ??
        `onboarding chat probe failed with HTTP ${result.status}`
    ).toBe(true);
  });
});
