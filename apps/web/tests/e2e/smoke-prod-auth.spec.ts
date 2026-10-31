import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import {
  mintPassageToken,
  PASSAGE_TOKEN_HEADER,
} from '@/lib/synthetic/passage-token';
import {
  PRODCERT_ADMIN_READBACK_EMAIL,
  PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
} from '@/lib/synthetic/prodcert-identities';
import { fillControlledInputUntilEnabled } from '../helpers/auth';
import {
  assertExactNavigationUrl,
  isExactNavigationUrl,
  recordPlaywrightSensitiveValues,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { primeOriginBoundVercelBypass } from './utils/prime-vercel-bypass';
import {
  certStep,
  certStepBlocked,
  createSurfaceTelemetry,
  recordAdminReadback,
  recordCertObservation,
} from './utils/prod-cert-steps';
import { resolveProductionAuthCredentials } from './utils/production-auth-credentials';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
} from './utils/production-auth-interaction';
import {
  newProdcertUserEmail,
  waitForProductionAuthOtp,
} from './utils/production-auth-otp';
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
 * 5. The identity owns a claimed profile that renders publicly
 * 6. Navigation between key tabs works
 *
 * Max ~3min total. No golden path, no content gate, no admin tests.
 *
 * @production-smoke
 */

test.use({ storageState: { cookies: [], origins: [] } });

/** Saved signed-in session for the chat cert test (serial same-worker). */
let signedInStatePath: string | null = null;

/** Run tag shared by the fresh-user address and the edit-readback marker. */
function runTag(): string {
  return process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : `local${Date.now().toString(36)}`;
}

/**
 * The reply element is also the surface a quota wall or an application error
 * renders into: run 41165214531's receipt claimed a passed first reply at
 * 703ms while its frame showed "You have reached your weekly AI message
 * limit". A visible reply element proves nothing on its own — the reply must
 * carry real assistant content and must never be the rate limit or an error
 * surface (JOV-9625). This intentionally extends the chat cert's inline quota
 * pattern (#24014) with the generic error surfaces.
 */
const PROD_REPLY_FAILURE_PATTERN =
  /reached your chat limit|out of messages|weekly (ai )?(message|chat) limit|message limit|application error|something went wrong|internal server error|could not verify your billing|temporarily limited|try again later/u;

async function assertAssistantReply(page: Page, label: string): Promise<void> {
  const reply = page.getByTestId('chat-message-reply').first();
  let text = '';
  await expect
    .poll(
      async () => {
        text = (await reply.innerText()).trim();
        return text.length;
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    text,
    `${label}: the reply is a quota or error surface, not an assistant response: ${text.slice(0, 200)}`
  ).not.toMatch(PROD_REPLY_FAILURE_PATTERN);
}

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

function describeOAuthHttpError(
  status: number,
  body: Record<string, unknown> | null
): string {
  const error = typeof body?.error === 'string' ? body.error : null;
  const description =
    typeof body?.error_description === 'string' ? body.error_description : null;
  if (!error && !description) {
    return `HTTP ${status}`;
  }
  return `HTTP ${status} (${[error, description].filter(Boolean).join(': ')})`;
}

async function readOAuthErrorBody(
  response: Awaited<ReturnType<APIRequestContext['post']>>
): Promise<Record<string, unknown> | null> {
  const body = (await response.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

async function createNativeLikeOAuthRequest(): Promise<APIRequestContext> {
  const bypassSecret = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  return playwrightRequest.newContext({
    extraHTTPHeaders: bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret }
      : {},
  });
}

async function readOAuthTokenSet(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  label: string
): Promise<OAuthTokenSet> {
  if (response.status() !== 200) {
    const body = await readOAuthErrorBody(response);
    throw new Error(
      `${label} returned ${describeOAuthHttpError(response.status(), body)}.`
    );
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
  sessionRequest: APIRequestContext,
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

  const authorizeResponse = await sessionRequest.get(authorizeUrl.href, {
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

  // Native iOS has no browser session cookies. Token POSTs from
  // page.context().request send the smoke session + Vercel bypass cookies,
  // which forces Better Auth CSRF/origin checks that the real client skips.
  // Authorize still uses the session request so skip_consent can issue a code.
  const nativeRequest = await createNativeLikeOAuthRequest();
  let activeAccessToken: string | undefined;
  let activeRefreshToken: string | undefined;
  try {
    const initialTokens = await readOAuthTokenSet(
      await nativeRequest.post(`${expectedOrigin}/api/auth/oauth2/token`, {
        failOnStatusCode: false,
        headers: { origin: expectedOrigin },
        form: {
          grant_type: 'authorization_code',
          client_id: IOS_OAUTH_CLIENT_ID,
          code: authorizationCode,
          code_verifier: codeVerifier,
          redirect_uri: IOS_OAUTH_REDIRECT_URI,
        },
      }),
      'iOS OAuth authorization-code exchange'
    );
    activeAccessToken = initialTokens.accessToken;
    activeRefreshToken = initialTokens.refreshToken;

    await verifyOAuthUserInfo(
      nativeRequest,
      expectedOrigin,
      initialTokens.accessToken,
      'Initial iOS OAuth access token'
    );

    const refreshedTokens = await readOAuthTokenSet(
      await nativeRequest.post(`${expectedOrigin}/api/auth/oauth2/token`, {
        failOnStatusCode: false,
        headers: { origin: expectedOrigin },
        form: {
          grant_type: 'refresh_token',
          client_id: IOS_OAUTH_CLIENT_ID,
          refresh_token: initialTokens.refreshToken,
        },
      }),
      'iOS OAuth refresh-token exchange'
    );
    activeAccessToken = refreshedTokens.accessToken;
    activeRefreshToken = refreshedTokens.refreshToken;
    await verifyOAuthUserInfo(
      nativeRequest,
      expectedOrigin,
      refreshedTokens.accessToken,
      'Refreshed iOS OAuth access token'
    );
  } finally {
    try {
      if (activeRefreshToken) {
        const revokeResponse = await nativeRequest.post(
          `${expectedOrigin}/api/auth/oauth2/revoke`,
          {
            failOnStatusCode: false,
            headers: { origin: expectedOrigin },
            form: {
              client_id: IOS_OAUTH_CLIENT_ID,
              token: activeRefreshToken,
              token_type_hint: 'refresh_token',
            },
          }
        );
        expect
          .soft(
            revokeResponse.status(),
            'Latest iOS OAuth refresh token revocation should succeed'
          )
          .toBe(200);
        if (revokeResponse.status() === 200 && activeAccessToken) {
          const revokedUserInfoResponse = await nativeRequest.get(
            `${expectedOrigin}/api/auth/oauth2/userinfo`,
            {
              failOnStatusCode: false,
              headers: { authorization: `Bearer ${activeAccessToken}` },
            }
          );
          expect
            .soft(
              revokedUserInfoResponse.status(),
              'Revoked iOS OAuth token family should reject userinfo'
            )
            .toBe(401);
        }
      }
    } finally {
      await nativeRequest.dispose();
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
  let emailForm = page
    .locator('form[data-auth-email-code-step="email"]')
    .first();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hasIdentifierInput = await emailForm
      .isVisible({ timeout: 15_000 })
      .catch(() => false);
    if (hasIdentifierInput) break;
    if (
      isExactNavigationUrl(page.url(), expectedOrigin) &&
      new URL(page.url()).pathname.startsWith('/app')
    ) {
      return 'authenticated';
    }
    if (attempt === 0) {
      await page.reload({
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        'Rendered sign-in reload'
      );
      emailForm = page
        .locator('form[data-auth-email-code-step="email"]')
        .first();
    } else {
      return 'signin-form-unavailable';
    }
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
    test.setTimeout(300_000);
    const credentials = getProdCredentials();
    const expectedOrigin = exactOriginForTest(testInfo);
    // JOV-9625 outcome receipt: per-surface console/network error counts and
    // one JPEG evidence frame per surface this run exercises.
    const telemetry = createSurfaceTelemetry(page);

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Sign-in navigation');

    const result = await certStep(
      'signup-signin',
      'returning-user-email-otp',
      async () => {
        const outcome = await signInViaRenderedFlow(
          page,
          credentials,
          expectedOrigin
        );
        if (outcome !== 'authenticated') {
          throw new Error(`returning-user sign-in ended as ${outcome}`);
        }
        return outcome;
      },
      () => 'creator-ready signed in with a fresh email OTP'
    ).catch(error => {
      // Preserve the original, more specific assertions below for the
      // known non-authenticated outcomes.
      if (
        !/ended as (verification-required|signin-form-unavailable)/.test(
          String(error?.message)
        )
      ) {
        throw error;
      }
      return String(error.message).includes('verification-required')
        ? ('verification-required' as SignInResult)
        : ('signin-form-unavailable' as SignInResult);
    });

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

    telemetry.record('signup-signin');
    await telemetry.capture(page, 'signup-signin');

    const mainText = await certStep(
      'onboarding',
      'dashboard-first-value',
      async () => {
        const text = await waitForProductionDashboardContent(
          page,
          SMOKE_TIMEOUTS.VISIBILITY
        );
        const lowered = text.toLowerCase();
        expect(lowered).not.toContain('application error');
        expect(lowered).not.toContain('something went wrong');
        return text;
      },
      text => `dashboard rendered ${text.length} chars of real content`
    );

    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');

    telemetry.record('onboarding');
    await telemetry.capture(page, 'onboarding');

    await verifyProductionIosOAuthTokenFlow(
      page.context().request,
      expectedOrigin
    );

    // Claim: the signed-in identity must own a claimed profile and that profile
    // must be live on its public URL. A sign-in that lands on a dashboard with
    // no claimed profile, or a claimed handle that 404s, breaks the artist
    // golden path even though the dashboard shell renders.
    const claimedUsername = await certStep(
      'claim',
      'claimed-profile-owned',
      async () => {
        const profileResponse = await page
          .context()
          .request.get(`${expectedOrigin}/api/dashboard/profile`);
        expect(
          profileResponse.status(),
          'Signed-in identity must resolve its claimed profile'
        ).toBe(200);
        const username = (
          (await profileResponse.json()) as {
            profile?: { username?: unknown };
          }
        ).profile?.username;
        expect(typeof username, 'Claimed profile has no handle').toBe('string');
        expect(String(username).length).toBeGreaterThan(0);
        return String(username);
      },
      username => `signed-in identity owns /${username}`
    );
    await certStep(
      'public-profile',
      'owned-profile-renders-publicly',
      async () => {
        const publicResponse = await page
          .context()
          .request.get(`${expectedOrigin}/${claimedUsername}`);
        expect(
          publicResponse.status(),
          `Claimed profile /${claimedUsername} must render publicly`
        ).toBe(200);
      },
      () => `/${claimedUsername} renders publicly`
    );

    // JOV-9625 outcome cert: the artist edit loop — edit the profile, save,
    // read the change back on the public profile, restore. Exercises the real
    // PUT /api/dashboard/profile save path and the public readback with the
    // signed-in canary identity; the bio is restored so the run is idempotent.
    await certStep(
      'public-profile',
      'profile-edit-save-readback',
      async () => {
        const profileResponse = await page
          .context()
          .request.get(`${expectedOrigin}/api/dashboard/profile`);
        expect(profileResponse.status()).toBe(200);
        const { profile } = (await profileResponse.json()) as {
          profile?: { id?: unknown; bio?: string | null; username?: unknown };
        };
        // The save route requires the claimed profile's canonical UUID plus
        // an updates envelope (apps/web/app/api/dashboard/profile/route.ts);
        // a bare field payload is rejected with 400 before any write.
        const profileId = typeof profile?.id === 'string' ? profile.id : '';
        expect(
          profileId,
          'Profile edit save requires the claimed profile id'
        ).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
        const originalBio = typeof profile?.bio === 'string' ? profile.bio : '';
        const marker = `prodcert edit-save-readback ${runTag()}`;
        const save = await page
          .context()
          .request.put(`${expectedOrigin}/api/dashboard/profile`, {
            data: { profileId, updates: { bio: marker } },
          });
        expect(save.status(), 'Profile edit save failed').toBe(200);
        try {
          // The save path invalidates the public profile's ISR + edge caches
          // (lib/cache/profile.ts invalidateProfileCache fires revalidatePath,
          // revalidateTag and the Redis edge purge), but that invalidation is
          // eventually consistent across the CDN. A single immediate sample
          // races the propagation window — the readback failed one attempt and
          // passed the next in run 41155363486 ("Saved bio must read back",
          // spec :692) and again in 41157880251. Poll the public render with a
          // bounded window instead of sampling once — the same move
          // waitForCheckoutEntryContent made for billing text after the
          // 2026-10-29 05:06Z promotion failed on a single empty sample.
          const readbackDeadlineMs = Date.now() + 30_000;
          let publicText = '';
          for (;;) {
            const publicPage = await page
              .context()
              .request.get(`${expectedOrigin}/${claimedUsername}`);
            expect(
              publicPage.status(),
              `Public profile /${claimedUsername} must render after the save`
            ).toBe(200);
            publicText = await publicPage.text();
            if (
              publicText.includes(marker) ||
              Date.now() >= readbackDeadlineMs
            ) {
              break;
            }
            await page.waitForTimeout(1_000);
          }
          expect(
            publicText,
            'Saved bio must read back on the public profile'
          ).toContain(marker);
          return marker;
        } finally {
          // Restore even on a failed readback so the canary profile is not
          // left carrying the marker between runs.
          const restore = await page
            .context()
            .request.put(`${expectedOrigin}/api/dashboard/profile`, {
              data: { profileId, updates: { bio: originalBio } },
            });
          expect(restore.status(), 'Profile edit restore failed').toBe(200);
        }
      },
      () => 'profile edit saved, read back on the public profile, restored'
    );
    await page.goto(`${expectedOrigin}/${claimedUsername}`, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
    telemetry.record('public-profile');
    await telemetry.capture(page, 'public-profile');

    const tabs = [
      {
        navigationPath: APP_ROUTES.AUDIENCE,
        readyPath: APP_ROUTES.AUDIENCE,
      },
      {
        navigationPath: APP_ROUTES.RELEASES,
        readyPath: APP_ROUTES.LIBRARY,
        // /app/releases aliases to the releases matrix. The asset catalog's
        // library-surface is not mounted for ?view=releases.
        readyTestId: 'shell-releases-view',
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

    // Chat: same session (a second OTP request would invalidate this one).
    // The identity is the tagged canary (+clerk_test), so its thread is
    // excluded from customer metrics; the thread is deleted at the end.
    await page.goto(APP_ROUTES.CHAT, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Chat navigation');
    await waitForHydration(page);

    await certStep(
      'checkout',
      'checkout-entry-renders',
      async () => {
        // JOV-10066: the checkout entry is the real /onboarding/checkout
        // surface (explicit paid intent, so the organic-offer gates cannot
        // redirect), not the billing settings page. The step stops before
        // the Stripe handoff — it asserts the upgrade entry rendered.
        await page.goto(
          `${expectedOrigin}/onboarding/checkout?source=intent&plan=pro&interval=month`,
          {
            waitUntil: 'domcontentloaded',
            timeout: SMOKE_TIMEOUTS.NAVIGATION,
          }
        );
        assertExactNavigationUrl(
          page.url(),
          expectedOrigin,
          'Onboarding checkout navigation'
        );
        // The receipt labels this surface web.onboarding-checkout, so the cert
        // must actually LAND on the registered screen: the origin check above
        // alone would pass a soft redirect to pricing or billing (JOV-9625).
        expect(
          new URL(page.url()).pathname,
          'the checkout cert must land on the registered /onboarding/checkout screen'
        ).toBe(APP_ROUTES.ONBOARDING_CHECKOUT);
        await waitForHydration(page);
        await expect(
          page.getByRole('heading', { name: /upgrade to/i }).first()
        ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
        // The CTA is `Upgrade to ${planMarketing.displayName}`
        // (OnboardingCheckoutClient); derive the plan name from the registry
        // instead of pinning old copy ("Pro" became "Artist Presence" and
        // blocked every production promotion on 2026-10-31, #24015).
        const upgradeButton = page.getByRole('button', {
          name: `Upgrade to ${getPlanDisplayName('pro')}`,
        });
        await expect(upgradeButton).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        await expect(upgradeButton).toBeEnabled();
        const checkoutText = (
          await page.locator('main').first().innerText()
        ).toLowerCase();
        expect(checkoutText).not.toMatch(
          /application error|something went wrong/
        );
        expect(checkoutText).toMatch(/pro/);
        // The paid plan is presented with its per-interval price; the cert
        // navigates with interval=month, so the monthly price must render.
        expect(checkoutText).toMatch(/\/mo/);
      },
      () =>
        'onboarding/checkout entry rendered the upgrade CTA; stopped before payment'
    );
    telemetry.record('checkout');
    await telemetry.capture(page, 'checkout');

    // JOV-9625 outcome rework: one admin certifications-inventory readback
    // attempt per run, as the documented CI admin fixture
    // (browse-admin+clerk_test@jov.ie). Recorded as receipt evidence on the
    // landing surface — never a check — so a not-viable fixture records the
    // exact blocker without turning any golden-path surface red.
    {
      const adminEmail = PRODCERT_ADMIN_READBACK_EMAIL;
      const adminContext = await page.context().browser()?.newContext();
      try {
        if (!adminContext) throw new Error('no browser context available');
        const adminPage = await adminContext.newPage();
        await adminPage.goto(APP_ROUTES.SIGNIN, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        const { submitButton } = await prepareProductionAuthEmailForm(
          adminPage,
          adminEmail
        );
        const otpRequestedAtMs = Date.now();
        await submitButton.click();
        const codeInput = adminPage
          .locator(
            'form[data-auth-email-code-step="code"] [data-testid="otp-autofill-input"], form[data-auth-email-code-step="code"] input[name="code"], form[data-auth-email-code-step="code"] input[autocomplete="one-time-code"], form[data-auth-email-code-step="code"] input[inputmode="numeric"]'
          )
          .first();
        await expect(codeInput).toBeVisible({ timeout: 15_000 });
        const adminCode = await waitForProductionAuthOtp({
          email: adminEmail,
          startedAtMs: otpRequestedAtMs,
        }).catch(error => {
          throw Object.assign(
            new Error(
              `admin fixture not viable: no fresh sign-in code for ${adminEmail} (${String(
                (error as Error)?.message ?? error
              ).slice(
                0,
                120
              )}) — the fixture is likely absent from the production Better Auth database`
            ),
            { recorded: true }
          );
        });
        await codeInput.fill(adminCode);
        await adminPage.waitForURL(
          url =>
            url.origin === expectedOrigin && url.pathname.startsWith('/app'),
          { timeout: 30_000 }
        );
        const inventoryResponse = await adminContext.request.get(
          `${expectedOrigin}/api/ovie/certifications`
        );
        if (inventoryResponse.status() === 200) {
          const inventory = (await inventoryResponse.json()) as {
            counts?: { total?: number };
          };
          recordAdminReadback({
            status: 'passed',
            detail: `admin certifications inventory read back as ${adminEmail}: ${inventory?.counts?.total ?? 0} rows`,
          });
        } else {
          recordAdminReadback({
            status: 'blocked',
            detail: `GET /api/ovie/certifications returned HTTP ${inventoryResponse.status()} for ${adminEmail} — the fixture is not an admin (users.isAdmin) in production`,
          });
        }
      } catch (error) {
        const recorded = error as { recorded?: boolean };
        recordAdminReadback({
          status: recorded.recorded ? 'blocked' : 'failed',
          detail: String((error as Error)?.message ?? error).slice(0, 1_900),
        });
      } finally {
        await adminContext?.close().catch(() => undefined);
      }
    }

    const performanceAuthStatePath =
      process.env.PERFORMANCE_AUTH_STATE_PATH?.trim();
    if (performanceAuthStatePath) {
      await page.context().storageState({ path: performanceAuthStatePath });
    }
    // The chat cert test reuses this session (serial same-worker); it never
    // re-signs-in — a second OTP would invalidate the first.
    signedInStatePath = join(tmpdir(), `prodcert-signed-in-${runTag()}.json`);
    await page.context().storageState({ path: signedInStatePath });
  });

  // JOV-9625 outcome rework: the chat certification is its own serial test
  // that reuses the signed-in session saved by the sign-in test above — a
  // chat turn must never be a dependency of establishing the authenticated
  // exact-build state (the exact-build perf lane greps only the sign-in
  // test). The cert stays truthful: it still fails on terminal/quota states.
  test('chat cert: first reply is a real assistant reply', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(240_000);
    const expectedOrigin = exactOriginForTest(testInfo);
    // The chat turn runs as the DEDICATED chat-health canary, never the
    // returning-creator canary (main's #23703 design): the server skips the
    // weekly quota for exactly that session email, so an exhausted golden-
    // path-walk allowance can never fail this cert. Sign-in is a fresh
    // rendered email-OTP flow — it must not disturb the setup test's session.
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await primeOriginBoundVercelBypass(context, expectedOrigin);
    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    const { submitButton } = await prepareProductionAuthEmailForm(
      page,
      PRODCERT_CHAT_HEALTH_CANARY_EMAIL
    );
    const otpRequestedAtMs = Date.now();
    await submitButton.click();
    const chatCodeInput = page
      .locator(
        'form[data-auth-email-code-step="code"] [data-testid="otp-autofill-input"], form[data-auth-email-code-step="code"] input[name="code"], form[data-auth-email-code-step="code"] input[autocomplete="one-time-code"], form[data-auth-email-code-step="code"] input[inputmode="numeric"]'
      )
      .first();
    await expect(chatCodeInput).toBeVisible({ timeout: 15_000 });
    const chatHealthCode = await waitForProductionAuthOtp({
      email: PRODCERT_CHAT_HEALTH_CANARY_EMAIL,
      startedAtMs: otpRequestedAtMs,
    });
    await chatCodeInput.fill(chatHealthCode);
    await page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    // Navigate to the real chat surface: /app is the Opportunity Inbox whose
    // shell composer has no attach toolbar, so the attach-button contracts
    // below must run on /app/chat (the round-1 in-setup flow navigated here
    // explicitly; the decoupling lost the navigation — JOV-10150).
    await page.goto(APP_ROUTES.CHAT, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Chat navigation');
    await waitForHydration(page);
    const telemetry = createSurfaceTelemetry(page);
    const composer = page.getByRole('textbox', { name: /chat message input/i });
    await certStep(
      'chat',
      'composer-ready',
      async () => {
        await expect(composer).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        await expect(composer).toBeEditable();

        // JOV-9625 outcome cert: the two local toolbar contracts, measured on
        // the composer's own attach toolbar — press feedback (button state
        // flips) and the local selector opening (palette becomes visible).
        const attach = page.getByRole('button', { name: 'Attachment options' });
        await expect(attach).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        const pressStart = Date.now();
        await attach.click();
        await expect(attach).toHaveAttribute('aria-expanded', 'true', {
          timeout: 5_000,
        });
        const feedbackMs = Date.now() - pressStart;
        recordCertObservation({
          surface: 'chat',
          contractId: 'selection-press-navigation.feedback',
          dimension: 'responsiveness',
          value: feedbackMs,
          unit: 'ms',
        });
        await expect(
          page
            .locator('[data-testid="shared-command-palette"], [role="listbox"]')
            .first()
        ).toBeVisible({ timeout: 5_000 });
        const openMs = Date.now() - pressStart;
        recordCertObservation({
          surface: 'chat',
          contractId: 'toolbar-context-menu.open',
          dimension: 'responsiveness',
          value: openMs,
          unit: 'ms',
        });
        await page.keyboard.press('Escape');
        await expect(attach).toHaveAttribute('aria-expanded', 'false', {
          timeout: 5_000,
        });
      },
      () => 'chat composer visible and editable; attach toolbar opened locally'
    );

    const probe = 'prodcert synthetic check: reply with the single word ok';
    const chatStartedAt = Date.now();
    let conversationId: string | null = null;
    try {
      await certStep(
        'chat',
        'first-reply',
        async () => {
          await composer.focus();
          await page.evaluate(() => {
            const el = document.activeElement;
            const w = window as unknown as { __prodcertAck?: Promise<number> };
            w.__prodcertAck = new Promise<number>(resolve => {
              let startedAt = 0;
              el?.addEventListener(
                'keydown',
                () => {
                  startedAt = performance.now();
                },
                { once: true }
              );
              el?.addEventListener(
                'input',
                () =>
                  requestAnimationFrame(() =>
                    resolve(performance.now() - startedAt)
                  ),
                { once: true }
              );
            });
          });
          await page.keyboard.press('p');
          const ackMs = await page.evaluate(
            () =>
              (window as unknown as { __prodcertAck: Promise<number> })
                .__prodcertAck
          );
          recordCertObservation({
            surface: 'chat',
            contractId: 'local-input.acknowledgement',
            dimension: 'responsiveness',
            value: Math.round(ackMs),
            unit: 'ms',
          });
          await composer.fill(probe);
          const sentAt = Date.now();
          const chatResponse = page.waitForResponse(
            candidate =>
              candidate.request().method() === 'POST' &&
              new URL(candidate.url()).pathname === '/api/chat',
            { timeout: 60_000 }
          );
          await page.getByRole('button', { name: /send message/i }).click();
          const response = await chatResponse;
          // The weekly-AI-quota path returns HTTP 200 with the limit text
          // streamed as an assistant message, so a rendered reply element
          // alone is a false pass. A terminal failure names itself in a
          // header; assert it absent before trusting any reply.
          const terminalFailure = response.headers()['x-chat-terminal-failure'];
          if (terminalFailure) {
            throw new Error(
              `chat turn ended in a terminal failure state: ${terminalFailure}`
            );
          }
          // conversation.active-state: the turn must enter an explicit
          // active/streaming state (thinking indicator or streamed reply).
          await expect(
            page
              .locator(
                "[data-testid='chat-loading-indicator'], [data-testid='chat-message-reply']"
              )
              .first()
          ).toBeVisible({ timeout: 30_000 });
          recordCertObservation({
            surface: 'chat',
            contractId: 'conversation.active-state',
            dimension: 'responsiveness',
            value: Date.now() - sentAt,
            unit: 'ms',
          });
          await expect(page.getByText(probe).first()).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
          const echoMs = Date.now() - sentAt;
          const reply = page.getByTestId('chat-message-reply').first();
          await expect(reply).toBeVisible({ timeout: 60_000 });
          const replyMs = Date.now() - sentAt;
          // A real assistant reply, not the quota/limit copy: the exhausted
          // weekly-AI-quota state streams its notice as an assistant message
          // and would otherwise satisfy the reply selector (JOV-10066).
          const replyText = (await reply.innerText()).toLowerCase();
          const quotaOrError =
            /reached your chat limit|out of messages|weekly (ai )?(message|chat) limit|could not verify your billing|temporarily limited|try again later/u;
          if (quotaOrError.test(replyText)) {
            throw new Error(
              `chat reply is a quota/error notice, not an assistant reply: ${replyText.slice(0, 160)}`
            );
          }
          recordCertObservation({
            surface: 'chat',
            contractId: 'conversation.message-echo',
            dimension: 'responsiveness',
            value: echoMs,
            unit: 'ms',
          });
          recordCertObservation({
            surface: 'chat',
            contractId: 'conversation.first-useful-output',
            dimension: 'responsiveness',
            value: replyMs,
            unit: 'ms',
          });
          const match = page.url().match(/[0-9a-f]{8}-[0-9a-f-]{27}/u);
          conversationId = match ? match[0] : null;
          return { echoMs, replyMs };
        },
        ({ echoMs, replyMs }) =>
          `assistant replied; message echo ${echoMs}ms, first reply ${replyMs}ms`
      );
    } finally {
      if (conversationId) {
        await page
          .context()
          .request.delete(
            `${expectedOrigin}/api/chat/conversations/${conversationId}`
          )
          .catch(() => undefined);
      }
      void chatStartedAt;
    }

    telemetry.record('chat');
    await telemetry.capture(page, 'chat');
    await context.close();
  });

  // JOV-9625: a brand-new user signs up with a fresh email OTP. The address is
  // the tagged prodcert canary (+synthetic-, excluded from customer metrics);
  // it is a different identity from creator-ready, so the OTPs cannot race.
  test('new user signs up with an email code', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const expectedOrigin = exactOriginForTest(testInfo);
    const email = newProdcertUserEmail(
      process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_RUN_ID}${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
        : `local${Date.now().toString(36)}`
    );
    recordPlaywrightSensitiveValues([email]);

    await certStep(
      'signup-signin',
      'new-user-email-otp',
      async () => {
        await page.goto(APP_ROUTES.SIGNIN, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        assertExactNavigationUrl(
          page.url(),
          expectedOrigin,
          'Signup navigation'
        );
        const { submitButton } = await prepareProductionAuthEmailForm(
          page,
          email
        );
        const requestedAtMs = Date.now();
        await submitButton.click();
        const codeInput = page
          .locator(
            'form[data-auth-email-code-step="code"] input[name="code"], form[data-auth-email-code-step="code"] input[autocomplete="one-time-code"], form[data-auth-email-code-step="code"] input[inputmode="numeric"], [data-testid="otp-autofill-input"]'
          )
          .first();
        await expect(codeInput).toBeVisible({ timeout: 15_000 });
        const code = await waitForProductionAuthOtp({
          email,
          startedAtMs: requestedAtMs,
        });
        await codeInput.fill(code);
        await page.waitForURL(
          url =>
            url.origin === expectedOrigin &&
            !url.pathname.startsWith(APP_ROUTES.SIGNIN),
          { timeout: 30_000 }
        );
        assertExactNavigationUrl(page.url(), expectedOrigin, 'Signup landing');
        // The post-signup redirect chain is still settling at this point: the
        // OTP form lands the fresh user on /app, and the NEEDS_ONBOARDING
        // state redirects to /start?fresh_signup=true. waitForURL unblocks at
        // the first off-/signin commit, so the chain and the landing page's
        // own load can still be in flight. Settle before this run navigates
        // again — a goto issued mid-chain aborts the in-flight navigation
        // (net::ERR_ABORTED, probes run 41152444713).
        await page.waitForLoadState('domcontentloaded', {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        const text = (await page.locator('body').innerText()).toLowerCase();
        expect(text).not.toMatch(/application error|something went wrong/);
        return new URL(page.url()).pathname;
      },
      pathname =>
        `new synthetic user verified an email OTP and landed on ${pathname}`
    );

    // JOV-9625 outcome cert: the fresh user reaches first value through the
    // real onboarding chat — the first assistant reply on /start. The same
    // canary passage token scheme as the anonymous claim run verifies
    // Turnstile in test mode for this signed-in fresh user's first touch.
    const passageKey = process.env.SYNTHETIC_PASSAGE_KEY ?? '';
    const expectedCertSha = process.env.EXPECTED_COMMIT_SHA ?? '';
    if (!passageKey || !/^[0-9a-f]{40}$/u.test(expectedCertSha)) {
      certStepBlocked(
        'onboarding',
        'fresh-user-onboarding-first-value',
        !passageKey
          ? 'SYNTHETIC_PASSAGE_KEY is not provided to this run'
          : 'EXPECTED_COMMIT_SHA is not provided to this run'
      );
      return;
    }
    const onboardingToken = mintPassageToken(
      Buffer.from(passageKey, 'base64url'),
      {
        sub: email,
        scp: 'onboarding_chat',
        run: runTag().slice(0, 64),
        ttlSeconds: 300,
      }
    );
    recordPlaywrightSensitiveValues([onboardingToken]);
    await page.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== expectedOrigin) {
        await route.continue();
        return;
      }
      await route.continue({
        headers: {
          ...request.headers(),
          [PASSAGE_TOKEN_HEADER]: onboardingToken,
          'x-synthetic-monitoring': 'prod-cert',
        },
      });
    });

    const telemetry = createSurfaceTelemetry(page);
    await certStep(
      'onboarding',
      'fresh-user-onboarding-first-value',
      async () => {
        await page.goto(`${expectedOrigin}/start`, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        assertExactNavigationUrl(page.url(), expectedOrigin, 'Onboarding chat');
        const input = page.locator('[aria-label="Chat message input" i]');
        const sendButton = page.getByRole('button', { name: 'Send message' });
        await expect(input).toBeVisible({ timeout: 30_000 });
        await fillControlledInputUntilEnabled(
          input,
          sendButton,
          'Help me set up my artist profile'
        );
        const [response] = await Promise.all([
          page.waitForResponse(
            candidate =>
              candidate.request().method() === 'POST' &&
              new URL(candidate.url()).pathname === '/api/chat',
            { timeout: 60_000 }
          ),
          sendButton.click(),
        ]);
        if (response.status() !== 200) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `/api/chat HTTP ${response.status()} ${body.slice(0, 160)}`
          );
        }
        await expect(
          page.locator("[data-testid='chat-message-reply']").first()
        ).toBeVisible({ timeout: 60_000 });
        // The reply element is also where a quota wall renders (the weekly
        // limit streams its notice as an assistant message); a visible
        // element alone is a false pass (JOV-9625). Require real content.
        await assertAssistantReply(page, 'fresh-user onboarding first value');
        return 'first assistant reply';
      },
      () => 'fresh user reached first value: onboarding chat first reply'
    );
    telemetry.record('onboarding');
    await telemetry.capture(page, 'onboarding');
  });
});
