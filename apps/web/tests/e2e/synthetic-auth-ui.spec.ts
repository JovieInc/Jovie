import { expect, type Page, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Layer A — Unauthenticated auth-UI smoke (no OAuth round-trip).
 *
 * Replaces the email/OTP signup canary that previously lived in
 * `synthetic-golden-path.spec.ts`. Jovie is SSO-only (Google + Apple via
 * Clerk) — see JOV-2446 — so the production canary should validate the
 * unauthenticated auth surface end-to-end without driving a real OAuth
 * flow (Google flags automation, MFA blocks it).
 *
 * What this catches:
 * - Broken Clerk JS bundle / FAPI proxy regression (/__clerk/*)
 * - Publishable/secret key mismatch on the active deploy
 * - Missing or misconfigured SSO provider
 * - CSP misconfig blocking Clerk
 * - Email/password silently re-enabled in the Clerk dashboard (the
 *   `clerk-config-audit` cron is the primary alarm; this is a secondary)
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
] as const;

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

async function assertNoCredentialInputsRendered(page: Page) {
  // Per JOV-2446 prevention contract: if any of these inputs render in
  // production, the Clerk dashboard regressed email/password back on. The
  // `clerk-config-audit` cron should also have fired by now — but this
  // assertion is the user-visible canary.
  await expect(
    page.locator('input[type="email"]'),
    'No email input may render on the SSO-only auth surface'
  ).toHaveCount(0);
  await expect(
    page.locator('input[type="password"]'),
    'No password input may render on the SSO-only auth surface'
  ).toHaveCount(0);
  await expect(
    page.locator('input[name="identifier"], input[name="emailAddress"]'),
    'No Clerk identifier/email input may render on the SSO-only auth surface'
  ).toHaveCount(0);
  await expect(
    page.locator('input[name="password"]'),
    'No Clerk password input may render on the SSO-only auth surface'
  ).toHaveCount(0);
  // Verification-step inputs must also stay hidden (defense in depth).
  await expect(
    page.locator('input[name="code"]'),
    'No OTP verification code input may render on the SSO-only auth surface'
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

test.describe('Synthetic Monitoring — Layer A (auth UI, SSO-only)', () => {
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('Sign-in surface renders SSO buttons only and starts Google OAuth on click', async ({
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

    console.log('[Synthetic][Layer A] Asserting no credential inputs render');
    await assertNoCredentialInputsRendered(page);

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

    // Subtraction principle: the SSO-only surface no longer has an "or"
    // divider — verify it stays gone.
    const dividerText = (
      await page
        .locator('[data-auth-shell-mode="sign-in"]')
        .innerText()
        .catch(() => '')
    ).toLowerCase();
    expect(dividerText).not.toContain('\nor\n');
    expect(dividerText).not.toMatch(/\s+or\s+/);

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

  test('Sign-up surface renders SSO buttons only (no credential inputs)', async ({
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
    await assertNoCredentialInputsRendered(page);

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
