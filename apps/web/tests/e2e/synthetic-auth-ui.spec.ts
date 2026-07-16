import { expect, type Page, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Layer A — Unauthenticated auth-UI smoke (no OAuth round-trip).
 *
 * Replaces the email/OTP signup canary that previously lived in
 * `synthetic-golden-path.spec.ts`. Production auth intentionally supports
 * Google + Apple SSO and email/identifier sign-in (JOV-2763) — see JOV-2446
 * for the original SSO-only cutover context.
 *
 * What this catches:
 * - Broken auth client or Better Auth route configuration
 * - Missing or misconfigured SSO provider
 * - CSP misconfig blocking OAuth initiation
 * - Auth surface failing to render live SSO + email controls
 *
 * What this does NOT cover (deferred to Sentry/RUM + the Layer B follow-up
 * Linear issue gated on a real incident):
 * - Clerk session validation
 * - Middleware auth chain (`proxy.ts`)
 * - Protected-route serving
 * - DB connectivity for authed users
 * - Entitlement resolution
 */

// Run as unauthenticated (override any session storage state).
test.use({ storageState: { cookies: [], origins: [] } });

const SIGNIN_PATH = '/signin';
const SIGNUP_PATH = '/signup';
const FRONT_DOOR_CONFIG_ERRORS = [
  'auth unavailable',
  'clerk is not configured',
  'turnstile is not configured',
  'verification failed (110200)',
] as const;

const EMAIL_IDENTIFIER_INPUT_SELECTOR =
  'input[type="email"], input[name="identifier"], input[name="emailAddress"]';

async function installSyntheticRouteStubs(page: Page) {
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

async function assertNoFrontDoorConfigErrors(page: Page) {
  const bodyText = (
    await page
      .locator('body')
      .innerText({ timeout: 10_000 })
      .catch(() => '')
  ).toLowerCase();

  for (const phrase of FRONT_DOOR_CONFIG_ERRORS) {
    expect(
      bodyText,
      `Page body should not contain "${phrase}" — got: ${bodyText.slice(0, 200)}`
    ).not.toContain(phrase);
  }
}

async function assertIntentionalEmailAuthSurface(page: Page) {
  // Production intentionally renders an email/identifier input alongside SSO.
  // Password must stay disabled — email OTP is the supported credential path.
  await expect(
    page.locator(EMAIL_IDENTIFIER_INPUT_SELECTOR),
    'Email/identifier input should render on the intentional email auth surface'
  ).toHaveCount(1, { timeout: 15_000 });
  await expect(
    page.locator('input[type="password"]'),
    'No password input may render — email OTP is the supported credential path'
  ).toHaveCount(0);
  await expect(
    page.locator('input[name="password"]'),
    'No Clerk password input may render — email OTP is the supported credential path'
  ).toHaveCount(0);
}

async function assertAuthShellReady(page: Page, expectedMode: string) {
  const shell = page.locator(
    `[data-auth-shell-mode="${expectedMode}"][data-auth-shell-ready="true"]`
  );
  await expect(
    shell,
    `AuthShell did not signal data-auth-shell-ready=true for mode=${expectedMode}`
  ).toBeVisible({ timeout: 30_000 });
}

async function assertActiveAuthSurfaceContract(page: Page) {
  await expect(
    page.locator('[data-auth-sso-surface]'),
    'Auth shell should render the active SSO surface'
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-auth-provider-slots]'),
    'Auth shell should expose provider controls'
  ).toBeVisible();
  await expect(
    page.locator('[data-auth-email-form-slot]'),
    'Auth shell should expose the passwordless email flow'
  ).toBeVisible();
  await expect(
    page.locator('[data-auth-oauth-error-slot][aria-live="polite"]'),
    'OAuth start errors should have a live announcement region'
  ).toHaveCount(1);
}

test.describe('Synthetic Monitoring — Layer A (auth UI, SSO + email)', () => {
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip(
        true,
        'Synthetic auth UI canary only runs when E2E_SYNTHETIC_MODE=true.'
      );
    }
  });

  test('Sign-in surface renders SSO buttons and email auth; Google OAuth starts on click', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await installSyntheticRouteStubs(page);

    console.log('[Synthetic][Layer A] Visiting /signin');
    await page.goto(SIGNIN_PATH, {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    await assertNoFrontDoorConfigErrors(page);
    await assertAuthShellReady(page, 'sign-in');
    await assertActiveAuthSurfaceContract(page);

    console.log(
      '[Synthetic][Layer A] Asserting intentional email auth surface'
    );
    await assertIntentionalEmailAuthSurface(page);

    console.log('[Synthetic][Layer A] Asserting SSO buttons render');
    const googleButton = page.getByRole('button', {
      name: /continue with google/i,
    });
    const appleButton = page.getByRole('button', {
      name: /continue with apple/i,
    });
    await expect(googleButton).toBeVisible({ timeout: 15_000 });
    await expect(appleButton).toBeVisible({ timeout: 15_000 });
    await expect(googleButton).toBeEnabled();

    console.log('[Synthetic][Layer A] Asserting Google button initiates OAuth');
    // Wait for the navigation that Clerk triggers to accounts.google.com.
    // We don't let it complete — Google does not tolerate automated agents.
    const googleNavigation = page
      .waitForRequest(
        request =>
          request.url().includes('accounts.google.com') &&
          request.isNavigationRequest(),
        { timeout: 20_000 }
      )
      .catch(() => null);

    await googleButton.click();
    const googleRequest = await googleNavigation;
    expect(
      googleRequest,
      'Clicking Continue with Google should initiate navigation to accounts.google.com within 20s'
    ).not.toBeNull();

    console.log('[Synthetic][Layer A] Sign-in surface OK');
  });

  test('Sign-up surface renders SSO buttons and email auth', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await installSyntheticRouteStubs(page);

    console.log('[Synthetic][Layer A] Visiting /signup');
    await page.goto(SIGNUP_PATH, {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    await assertNoFrontDoorConfigErrors(page);
    await assertAuthShellReady(page, 'sign-up');
    await assertActiveAuthSurfaceContract(page);
    await assertIntentionalEmailAuthSurface(page);

    const googleButton = page.getByRole('button', {
      name: /continue with google/i,
    });
    const appleButton = page.getByRole('button', {
      name: /continue with apple/i,
    });
    await expect(googleButton).toBeVisible({ timeout: 15_000 });
    await expect(appleButton).toBeVisible({ timeout: 15_000 });

    console.log('[Synthetic][Layer A] Sign-up surface OK');
  });
});
