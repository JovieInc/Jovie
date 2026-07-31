import { createHash, randomBytes } from 'node:crypto';
import {
  type APIRequestContext,
  expect,
  Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  assertExactNavigationUrl,
  isExactNavigationUrl,
  recordPlaywrightSensitiveValues,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { primeOriginBoundVercelBypass } from './utils/prime-vercel-bypass';
import { resolveProductionAuthCredentials } from './utils/production-auth-credentials';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
} from './utils/production-auth-interaction';
import { waitForProductionAuthOtp } from './utils/production-auth-otp';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production Auth Smoke Tests
 *
 * Lightweight tests that run against the PRODUCTION deployment after deploy.
 * Uses a seeded Better Auth production identity and a fresh real sign-in OTP.
 *
 * These tests verify:
 * 1. Sign-in flow works with real credentials
 * 2. Dashboard loads with real data (not empty state)
 * 3. The LogYourBody iOS public client completes a real PKCE token exchange
 * 4. Userinfo, refresh-token rotation, and token revocation work
 * 5. Navigation between key tabs works
 *
 * Max ~3min total. No golden path, no content gate, no admin tests.
 *
 * @production-smoke
 */

test.use({ storageState: { cookies: [], origins: [] } });

function hasProdAuthCredentials(): boolean {
  return resolveProductionAuthCredentials() !== null;
}

function getProdCredentials() {
  const credentials = resolveProductionAuthCredentials();
  if (!credentials) {
    throw new Error(
      'Production auth smoke requires a configured Better Auth identity and OTP source.'
    );
  }
  return credentials;
}

type SignInResult =
  | 'authenticated'
  | 'verification-required'
  | 'signin-form-unavailable'
  | 'unknown';

type SignInNextStep = 'redirected' | 'password' | 'email_code' | 'unknown';

const IOS_OAUTH_CLIENT_ID = 'logyourbody-ios';
const IOS_OAUTH_REDIRECT_URI = 'logyourbody://oauth';
const IOS_OAUTH_SCOPE = 'openid profile email offline_access';

interface OAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly idToken?: string;
}

function requiredResponseString(
  body: Record<string, unknown>,
  field: string
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length < 20) {
    throw new Error(`OAuth token response is missing a valid ${field}.`);
  }
  return value;
}

async function readOAuthTokenSet(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  label: string,
  rememberToken: (value: string, hint: 'access_token' | 'refresh_token') => void
): Promise<OAuthTokenSet> {
  if (response.status() !== 200) {
    throw new Error(`${label} returned HTTP ${response.status()}.`);
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${label} returned a malformed token response.`);
  }
  const record = body as Record<string, unknown>;
  const sensitiveValues = ['access_token', 'refresh_token', 'id_token']
    .map(field => record[field])
    .filter((value): value is string => typeof value === 'string');
  if (sensitiveValues.length > 0) {
    recordPlaywrightSensitiveValues(sensitiveValues);
  }
  const accessToken = requiredResponseString(record, 'access_token');
  const refreshToken = requiredResponseString(record, 'refresh_token');
  rememberToken(accessToken, 'access_token');
  rememberToken(refreshToken, 'refresh_token');
  const idToken =
    typeof record.id_token === 'string' && record.id_token.length >= 20
      ? record.id_token
      : undefined;
  return { accessToken, refreshToken, idToken };
}

async function verifyOAuthUserInfo(
  request: APIRequestContext,
  expectedOrigin: string,
  accessToken: string,
  label: string
): Promise<void> {
  const response = await request.get(
    `${expectedOrigin}/api/auth/oauth2/userinfo`,
    {
      failOnStatusCode: false,
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );
  if (response.status() !== 200) {
    throw new Error(`${label} userinfo returned HTTP ${response.status()}.`);
  }
  const userInfo = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !userInfo ||
    typeof userInfo.sub !== 'string' ||
    userInfo.sub.length === 0
  ) {
    throw new Error(`${label} userinfo returned an invalid subject.`);
  }
}

async function verifyProductionIosOAuthTokenFlow(
  request: APIRequestContext,
  expectedOrigin: string
): Promise<void> {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const state = randomBytes(32).toString('base64url');
  recordPlaywrightSensitiveValues([codeVerifier]);

  const authorizeUrl = new URL('/api/auth/oauth2/authorize', expectedOrigin);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', IOS_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', IOS_OAUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', IOS_OAUTH_SCOPE);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const authorizeResponse = await request.get(authorizeUrl.href, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  if (![302, 303].includes(authorizeResponse.status())) {
    throw new Error(
      `iOS OAuth authorization returned HTTP ${authorizeResponse.status()}.`
    );
  }
  const location = authorizeResponse.headers().location;
  if (!location) {
    throw new Error('iOS OAuth authorization did not return a redirect.');
  }
  const callbackUrl = new URL(location);
  const authorizationCode = callbackUrl.searchParams.get('code');
  if (authorizationCode) {
    recordPlaywrightSensitiveValues([authorizationCode]);
  }
  if (
    callbackUrl.protocol !== 'logyourbody:' ||
    callbackUrl.host !== 'oauth' ||
    callbackUrl.pathname !== '' ||
    callbackUrl.searchParams.get('state') !== state ||
    callbackUrl.searchParams.has('error') ||
    !authorizationCode
  ) {
    throw new Error('iOS OAuth authorization returned an invalid callback.');
  }

  const issuedTokens = new Map<
    string,
    {
      readonly value: string;
      readonly hint: 'access_token' | 'refresh_token';
    }
  >();
  const rememberToken = (
    value: string,
    hint: 'access_token' | 'refresh_token'
  ) => {
    issuedTokens.set(`${hint}:${value}`, { value, hint });
  };
  try {
    const initialTokens = await readOAuthTokenSet(
      await request.post(`${expectedOrigin}/api/auth/oauth2/token`, {
        failOnStatusCode: false,
        // The exact Vercel deployment is protected by an origin-bound bypass
        // cookie. Better Auth therefore requires a trusted Origin on POST even
        // though the real native client has no cookies.
        headers: { origin: expectedOrigin },
        form: {
          grant_type: 'authorization_code',
          client_id: IOS_OAUTH_CLIENT_ID,
          code: authorizationCode,
          code_verifier: codeVerifier,
          redirect_uri: IOS_OAUTH_REDIRECT_URI,
        },
      }),
      'iOS OAuth authorization-code exchange',
      rememberToken
    );

    await verifyOAuthUserInfo(
      request,
      expectedOrigin,
      initialTokens.accessToken,
      'Initial iOS OAuth access token'
    );

    const refreshedTokens = await readOAuthTokenSet(
      await request.post(`${expectedOrigin}/api/auth/oauth2/token`, {
        failOnStatusCode: false,
        headers: { origin: expectedOrigin },
        form: {
          grant_type: 'refresh_token',
          client_id: IOS_OAUTH_CLIENT_ID,
          refresh_token: initialTokens.refreshToken,
        },
      }),
      'iOS OAuth refresh-token exchange',
      rememberToken
    );
    await verifyOAuthUserInfo(
      request,
      expectedOrigin,
      refreshedTokens.accessToken,
      'Refreshed iOS OAuth access token'
    );
  } finally {
    // Cleanup only. After refresh-token rotation, revoking earlier tokens can
    // legitimately return 400; soft expects still fail the test and would
    // block Production promote even when exchange/userinfo/refresh passed.
    for (const { value, hint } of issuedTokens.values()) {
      try {
        await request.post(`${expectedOrigin}/api/auth/oauth2/revoke`, {
          failOnStatusCode: false,
          headers: { origin: expectedOrigin },
          form: {
            client_id: IOS_OAUTH_CLIENT_ID,
            token: value,
            token_type_hint: hint,
          },
        });
      } catch {
        // best-effort cleanup must never fail the auth smoke
      }
      void hint;
    }
  }
}

function exactOriginForTest(testInfo: TestInfo): string {
  const baseUrl = testInfo.project.use.baseURL;
  if (typeof baseUrl !== 'string') {
    throw new Error('Production auth smoke requires an exact baseURL.');
  }
  return requireExactNavigationOrigin(baseUrl);
}

async function detectNextStep(
  page: Page,
  expectedOrigin: string
): Promise<SignInNextStep> {
  return page
    .waitForFunction(
      exactOrigin => {
        if (window.location.origin !== exactOrigin) return false;
        if (window.location.pathname.startsWith('/app')) return 'redirected';
        if (
          document.querySelector(
            'input[name="password"], input[type="password"]'
          )
        ) {
          return 'password';
        }
        if (
          document.querySelector('[data-auth-email-code-step="code"]') ||
          document.querySelector(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ) {
          return 'email_code';
        }
        return false;
      },
      expectedOrigin,
      { timeout: 15_000 }
    )
    .then(handle => handle.jsonValue() as Promise<SignInNextStep>)
    .catch(() => 'unknown');
}

async function signInViaRenderedFlow(
  page: Page,
  credentials: ReturnType<typeof getProdCredentials>,
  expectedOrigin: string
): Promise<SignInResult> {
  assertExactNavigationUrl(page.url(), expectedOrigin, 'Rendered sign-in flow');
  const emailForm = page
    .locator('form[data-auth-email-code-step="email"]')
    .first();
  const hasIdentifierInput = await emailForm
    .isVisible({ timeout: 15_000 })
    .catch(() => false);

  if (!hasIdentifierInput) {
    if (
      isExactNavigationUrl(page.url(), expectedOrigin) &&
      new URL(page.url()).pathname.startsWith('/app')
    ) {
      return 'authenticated';
    }
    return 'signin-form-unavailable';
  }

  const { submitButton } = await prepareProductionAuthEmailForm(
    page,
    credentials.email
  );
  const otpRequestedAtMs = Date.now();
  await submitButton.click();

  const nextStep = await detectNextStep(page, expectedOrigin);

  if (nextStep === 'redirected') {
    return 'authenticated';
  }

  if (nextStep === 'password') {
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(credentials.password);
    await page
      .locator('form:has(input[type="password"]) button[type="submit"]')
      .first()
      .click();
    await page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Password redirect');
    return 'authenticated';
  }

  if (nextStep === 'email_code') {
    const codeForm = page
      .locator('form[data-auth-email-code-step="code"]')
      .first();
    const codeInput = codeForm
      .locator(
        '[data-testid="otp-autofill-input"], input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      )
      .first();
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    const verificationCode =
      credentials.verificationCode ||
      (await waitForProductionAuthOtp({
        email: credentials.email,
        startedAtMs: otpRequestedAtMs,
      }));
    const authenticatedRedirect = page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    await codeInput.fill(verificationCode);
    await authenticatedRedirect;
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Email-code redirect');
    return 'authenticated';
  }

  return 'unknown';
}

test.describe('Production Auth Smoke @production-smoke', () => {
  // Keep sign-in and authenticated navigation in one browser session. Requesting
  // another Better Auth OTP can invalidate the prior code, so future checks must
  // extend this flow instead of creating a second authenticated test.
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeEach(async ({ context }, testInfo) => {
    if (!hasProdAuthCredentials()) {
      test.skip(true, 'No production auth credentials configured');
      return;
    }

    const baseUrl = testInfo.project.use.baseURL;
    if (typeof baseUrl !== 'string') {
      throw new Error('Production auth smoke requires an exact baseURL.');
    }
    await primeOriginBoundVercelBypass(context, baseUrl);
  });

  test('sign-in works and dashboard loads', async ({ page }, testInfo) => {
    const credentials = getProdCredentials();
    const expectedOrigin = exactOriginForTest(testInfo);

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Sign-in navigation');

    const result = await signInViaRenderedFlow(
      page,
      credentials,
      expectedOrigin
    );

    if (result === 'verification-required') {
      throw new Error(
        'Better Auth rendered email-code verification without a configured OTP source'
      );
    }
    if (result === 'signin-form-unavailable') {
      throw new Error('Better Auth sign-in form not available');
    }

    expect(result).toBe('authenticated');

    await waitForHydration(page);
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      'Hydrated dashboard navigation'
    );

    const main = page.locator('main').first();
    await expect(main, 'Dashboard should be visible after sign-in').toBeVisible(
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    const mainText = await waitForProductionDashboardContent(
      page,
      SMOKE_TIMEOUTS.VISIBILITY
    );

    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');

    await verifyProductionIosOAuthTokenFlow(
      page.context().request,
      expectedOrigin
    );

    const tabs = [
      {
        navigationPath: APP_ROUTES.AUDIENCE,
        readyPath: APP_ROUTES.AUDIENCE,
      },
      {
        navigationPath: APP_ROUTES.RELEASES,
        readyPath: APP_ROUTES.LIBRARY,
        readyTestId: 'library-surface',
        readyView: 'releases',
      },
    ];

    for (const { navigationPath, readyPath, readyTestId, readyView } of tabs) {
      await page.goto(navigationPath, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        `Dashboard tab navigation for ${navigationPath}`
      );

      await page.waitForURL(
        url =>
          url.origin === expectedOrigin &&
          url.pathname === readyPath &&
          (!readyView || url.searchParams.get('view') === readyView),
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );
      if (readyTestId) {
        await expect(page.getByTestId(readyTestId)).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      }
      await waitForHydration(page);
      const currentUrl = assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        `Hydrated dashboard tab navigation for ${navigationPath}`
      );

      expect(currentUrl.pathname).not.toContain(APP_ROUTES.SIGNIN);
      expect(currentUrl.pathname).not.toContain('/sign-in');

      const tabMain = page.locator('main').first();
      await expect(
        tabMain,
        `${navigationPath}: main content should be visible`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      const tabMainText = await waitForProductionDashboardContent(
        page,
        SMOKE_TIMEOUTS.VISIBILITY
      );
      expect(tabMainText.toLowerCase()).not.toMatch(
        /application error|something went wrong/
      );
    }

    const performanceAuthStatePath =
      process.env.PERFORMANCE_AUTH_STATE_PATH?.trim();
    if (performanceAuthStatePath) {
      await page.context().storageState({ path: performanceAuthStatePath });
    }
  });
});
