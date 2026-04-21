import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { APIResponse, expect, Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode';
import { ensureClerkTestUser } from '@/lib/testing/test-user-provision.server';
import { smokeNavigateWithRetry } from '../e2e/utils/smoke-test-utils';
import { primeVercelBypassCookie } from './vercel-preview';

const AUTH_READY_ROUTE = APP_ROUTES.DASHBOARD;
const CLERK_BOOTSTRAP_NAV_TIMEOUT_MS = 60_000;
const CLERK_BOOTSTRAP_NAV_RETRIES = 3;

function isTestAuthBypassEnabled(): boolean {
  return process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
}

function getTestAuthBypassUserId(): string | null {
  const userId = process.env.E2E_CLERK_USER_ID?.trim();
  return userId && userId.length > 0 ? userId : null;
}

function getRequestedBypassPersona(): DevTestAuthPersona | null {
  const persona = process.env.E2E_TEST_AUTH_PERSONA?.trim();
  if (
    persona === 'creator' ||
    persona === 'creator-ready' ||
    persona === 'admin'
  ) {
    return persona;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolveSleep => {
    setTimeout(resolveSleep, ms);
  });
}

async function fetchJsonInBrowserContext<T>(
  page: Page,
  url: string
): Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly payload: T | null;
}> {
  const probePage = await page.context().newPage();

  try {
    const response = await probePage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const status = response?.status() ?? 0;
    const rawBody =
      (await probePage
        .locator('body')
        .textContent()
        .catch(() => null)) ?? '';
    let payload: T | null = null;
    if (rawBody.trim().length > 0) {
      try {
        payload = JSON.parse(rawBody) as T;
      } catch {
        payload = null;
      }
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      payload,
    };
  } finally {
    await probePage.close().catch(() => undefined);
  }
}

async function parseJsonSafely<T>(response: APIResponse): Promise<T | null> {
  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return null;
  }
}

export function canFallbackToBypassUserId(
  persona: 'creator' | 'admin' | null
): boolean {
  return persona === 'creator';
}

async function resolveBypassUserId(
  baseUrl: string,
  fallbackUserId: string,
  persona: DevTestAuthPersona | null
): Promise<string> {
  if (!persona) {
    return fallbackUserId;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        new URL('/api/dev/test-auth/session', baseUrl),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to resolve ${persona} test auth persona.`);
      }

      const payload = (await response.json()) as { userId?: string | null };
      return payload.userId?.trim() || fallbackUserId;
    } catch {
      if (attempt === 3) {
        if (canFallbackToBypassUserId(persona)) {
          console.warn(
            `[clerk-auth] Falling back to configured bypass user for ${persona} persona after session bootstrap failed`
          );
          return fallbackUserId;
        }

        throw new ClerkTestError(
          `Failed to resolve ${persona} test auth persona.`,
          'CLERK_SETUP_FAILED'
        );
      }

      await sleep(500 * attempt);
    }
  }

  return fallbackUserId;
}

async function enableTestAuthBypass(page: Page): Promise<void> {
  const existingCookies = await page.context().cookies();
  const existingMode = existingCookies.find(
    cookie => cookie.name === TEST_MODE_COOKIE
  )?.value;
  const existingUserId = existingCookies.find(
    cookie => cookie.name === TEST_USER_ID_COOKIE
  )?.value;
  const existingPersona = existingCookies.find(
    cookie => cookie.name === TEST_PERSONA_COOKIE
  )?.value;

  const defaultUserId = getTestAuthBypassUserId();
  const requestedPersona = getRequestedBypassPersona();
  const userId = existingUserId?.trim() || defaultUserId;
  const persona =
    (existingPersona === 'creator' ||
    existingPersona === 'creator-ready' ||
    existingPersona === 'admin'
      ? existingPersona
      : null) ?? requestedPersona;

  if (!userId) {
    throw new ClerkTestError(
      'E2E_CLERK_USER_ID is required when test auth bypass is enabled.',
      'MISSING_CREDENTIALS'
    );
  }

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const resolvedUserId =
    existingMode === TEST_AUTH_BYPASS_MODE && existingUserId?.trim()
      ? existingUserId.trim()
      : await resolveBypassUserId(baseUrl, userId, persona);
  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: resolvedUserId,
      url: baseUrl,
      sameSite: 'Lax',
    },
    ...(persona
      ? [
          {
            name: TEST_PERSONA_COOKIE,
            value: persona,
            url: baseUrl,
            sameSite: 'Lax' as const,
          },
        ]
      : []),
  ]);
}

export async function setTestAuthBypassSession(
  page: Page,
  persona: DevTestAuthPersona | null,
  overrideUserId?: string | null
): Promise<void> {
  const userId = overrideUserId?.trim() || getTestAuthBypassUserId();
  if (!userId) {
    throw new ClerkTestError(
      'E2E_CLERK_USER_ID is required when test auth bypass is enabled.',
      'MISSING_CREDENTIALS'
    );
  }

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const resolvedUserId = await resolveBypassUserId(baseUrl, userId, persona);
  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: resolvedUserId,
      url: baseUrl,
      sameSite: 'Lax',
    },
    ...(persona
      ? [
          {
            name: TEST_PERSONA_COOKIE,
            value: persona,
            url: baseUrl,
            sameSite: 'Lax' as const,
          },
        ]
      : []),
  ]);

  if (!persona) {
    await page.context().clearCookies({ name: TEST_PERSONA_COOKIE });
  }
}

export async function waitForAuthenticatedHealth(
  page: Page,
  expectedUserId?: string | null
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const authHealthUrl = new URL('/api/health/auth', baseUrl).toString();
  const bypassSessionUrl = new URL(
    '/api/dev/test-auth/session',
    baseUrl
  ).toString();
  const shouldPreferBypassSession =
    isTestAuthBypassEnabled() ||
    process.env.E2E_ATTACH_TEST_AUTH_BYPASS_AFTER_SIGNUP === '1';

  await expect
    .poll(
      async () => {
        try {
          const contextCookies = await page.context().cookies(baseUrl);
          const bypassCookieHeader = contextCookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
          const bypassHeaders = {
            ...(bypassCookieHeader ? { cookie: bypassCookieHeader } : {}),
            [TEST_MODE_HEADER]: TEST_AUTH_BYPASS_MODE,
            ...(expectedUserId
              ? { [TEST_USER_ID_HEADER]: expectedUserId }
              : {}),
          };

          if (shouldPreferBypassSession) {
            const bypassResponse = await fetchJsonInBrowserContext<{
              active?: boolean;
              userId?: string | null;
            }>(page, bypassSessionUrl);

            if (bypassResponse.ok) {
              const payload = bypassResponse.payload;

              if (payload?.active) {
                if (expectedUserId && payload.userId !== expectedUserId) {
                  return `user-mismatch:${payload.userId ?? 'unknown'}`;
                }

                return 'authenticated';
              }
            }

            const bypassSessionResponse = await page.request.get(
              bypassSessionUrl,
              {
                failOnStatusCode: false,
                headers: bypassHeaders,
              }
            );

            if (bypassSessionResponse.ok()) {
              const payload = await parseJsonSafely<{
                active?: boolean;
                userId?: string | null;
              }>(bypassSessionResponse);

              if (!payload) {
                return `http-${bypassSessionResponse.status()}`;
              }

              if (!payload.active) {
                return 'anonymous';
              }

              if (expectedUserId && payload.userId !== expectedUserId) {
                return `user-mismatch:${payload.userId ?? 'unknown'}`;
              }

              return 'authenticated';
            }
          }

          const response = await fetchJsonInBrowserContext<{
            authenticated?: boolean;
            userId?: string | null;
          }>(page, authHealthUrl);

          if (response.status === 403) {
            const bypassResponse = await fetchJsonInBrowserContext<{
              active?: boolean;
              userId?: string | null;
            }>(page, bypassSessionUrl);

            if (bypassResponse.ok) {
              const payload = bypassResponse.payload;

              if (!payload?.active) {
                return 'anonymous';
              }

              if (expectedUserId && payload.userId !== expectedUserId) {
                return `user-mismatch:${payload.userId ?? 'unknown'}`;
              }

              return 'authenticated';
            }

            const bypassSessionResponse = await page.request.get(
              bypassSessionUrl,
              {
                failOnStatusCode: false,
                headers: bypassHeaders,
              }
            );

            if (!bypassSessionResponse.ok()) {
              return `http-${bypassSessionResponse.status()}`;
            }

            const payload = await parseJsonSafely<{
              active?: boolean;
              userId?: string | null;
            }>(bypassSessionResponse);

            if (!payload) {
              return `http-${bypassSessionResponse.status()}`;
            }

            if (!payload.active) {
              return 'anonymous';
            }

            if (expectedUserId && payload.userId !== expectedUserId) {
              return `user-mismatch:${payload.userId ?? 'unknown'}`;
            }

            return 'authenticated';
          }

          if (response.ok) {
            const payload = response.payload;

            if (!payload?.authenticated) {
              return 'anonymous';
            }

            if (expectedUserId && payload.userId !== expectedUserId) {
              return `user-mismatch:${payload.userId ?? 'unknown'}`;
            }

            return 'authenticated';
          }

          const fallbackResponse = await page.request.get(authHealthUrl, {
            failOnStatusCode: false,
            headers: bypassHeaders,
          });

          if (fallbackResponse.status() === 403) {
            const bypassSessionResponse = await page.request.get(
              bypassSessionUrl,
              {
                failOnStatusCode: false,
                headers: bypassHeaders,
              }
            );

            if (!bypassSessionResponse.ok()) {
              return `http-${bypassSessionResponse.status()}`;
            }

            const payload = await parseJsonSafely<{
              active?: boolean;
              userId?: string | null;
            }>(bypassSessionResponse);

            if (!payload) {
              return `http-${bypassSessionResponse.status()}`;
            }

            if (!payload.active) {
              return 'anonymous';
            }

            if (expectedUserId && payload.userId !== expectedUserId) {
              return `user-mismatch:${payload.userId ?? 'unknown'}`;
            }

            return 'authenticated';
          }

          if (!fallbackResponse.ok()) {
            return `http-${fallbackResponse.status()}`;
          }

          const payload = await parseJsonSafely<{
            authenticated?: boolean;
            userId?: string | null;
          }>(fallbackResponse);

          if (!payload) {
            return `http-${fallbackResponse.status()}`;
          }

          if (!payload.authenticated) {
            return 'anonymous';
          }

          if (expectedUserId && payload.userId !== expectedUserId) {
            return `user-mismatch:${payload.userId ?? 'unknown'}`;
          }

          return 'authenticated';
        } catch (error) {
          if (error instanceof Error) {
            if (
              error.message.includes('Execution context was destroyed') ||
              error.message.includes('ECONNRESET') ||
              error.message.includes('socket hang up')
            ) {
              return 'retrying';
            }
          }
          throw error;
        }
      },
      { timeout: 30_000 }
    )
    .toBe('authenticated');
}

async function navigateToClerkSignIn(page: Page): Promise<void> {
  await page.request
    .get('/signin', {
      failOnStatusCode: false,
      timeout: 120_000,
    })
    .catch(() => {});

  await smokeNavigateWithRetry(page, '/signin', {
    timeout: CLERK_BOOTSTRAP_NAV_TIMEOUT_MS,
    retries: CLERK_BOOTSTRAP_NAV_RETRIES,
    waitUntil: 'commit',
  });

  await page
    .waitForLoadState('domcontentloaded', {
      timeout: CLERK_BOOTSTRAP_NAV_TIMEOUT_MS,
    })
    .catch(() => {});
}

async function waitForClerkSignInApi(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ready = await page
      .waitForFunction(
        () => {
          const clerkInstance = (
            window as {
              Clerk?: {
                loaded?: boolean;
                client?: {
                  signIn?: {
                    create?: unknown;
                  };
                };
                setActive?: unknown;
              };
            }
          ).Clerk;

          return Boolean(
            clerkInstance?.loaded &&
              typeof clerkInstance.client?.signIn?.create === 'function' &&
              typeof clerkInstance.setActive === 'function'
          );
        },
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false);

    if (ready) {
      return true;
    }

    const retryButton = page.getByRole('button', { name: 'Retry now' });
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click().catch(() => {});
    } else {
      await page
        .reload({
          waitUntil: 'domcontentloaded',
          timeout: CLERK_BOOTSTRAP_NAV_TIMEOUT_MS,
        })
        .catch(() => {});
    }
  }

  return false;
}

function isMissingClerkAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /couldn't find your account/i.test(message) ||
    /cannot find your account/i.test(message) ||
    /account.*not found/i.test(message) ||
    /identifier.*not found/i.test(message)
  );
}

async function waitForShellReadyAfterAuth(page: Page): Promise<void> {
  await smokeNavigateWithRetry(page, AUTH_READY_ROUTE, {
    timeout: 120_000,
    retries: 2,
  });

  if (isClerkHandshakeUrl(page.url())) {
    throw new ClerkTestError(
      'Clerk redirected to a handshake flow after sign-in on the current preview target.',
      'CLERK_SETUP_FAILED'
    );
  }

  let hasReloaded = false;
  await expect(async () => {
    const overlay = page.locator(
      '[data-nextjs-dialog-overlay], [data-nextjs-toast]'
    );
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    const tryAgain = page.locator('button:has-text("Try again")');
    if (await tryAgain.isVisible({ timeout: 500 }).catch(() => false)) {
      await tryAgain.click();
      await page.waitForTimeout(1000);
    }

    const dashNav = page.locator('nav[aria-label="Dashboard navigation"]');
    const userButton = page.locator('[data-clerk-element="userButton"]');
    const chatComposer = page
      .locator(
        'textarea, [contenteditable="true"], button:has-text("New thread")'
      )
      .first();
    const main = page.locator('main').first();
    const isShellReady = async () =>
      (page.url().includes('/app') &&
        !page.url().includes('/signin') &&
        !page.url().includes('/sign-in') &&
        !page.url().includes('/onboarding') &&
        (await main.isVisible().catch(() => false))) ||
      (await dashNav.isVisible().catch(() => false)) ||
      (await userButton.isVisible().catch(() => false)) ||
      (await chatComposer.isVisible().catch(() => false));

    if (!(await isShellReady()) && !hasReloaded) {
      hasReloaded = true;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }

    await expect.poll(isShellReady, { timeout: 5000 }).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [3000, 5000, 10000, 15000] });
}
/**
 * Check if the test target is a production deployment (jov.ie).
 * Used to gate heavy test suites that should only run against testing environments.
 */
export function isProductionTarget(): boolean {
  const baseUrl = process.env.BASE_URL ?? '';
  return baseUrl.includes('jov.ie');
}

/**
 * Check if the test is running in a testing environment.
 * Testing environments use +clerk_test emails or have Clerk testing tokens.
 */
export function isTestingEnvironment(): boolean {
  const email = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const clerkSetup = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';
  return email.includes('+clerk_test') || clerkSetup;
}

/**
 * Check if Clerk credentials are available for authenticated tests.
 * Supports passwordless Clerk test emails (containing +clerk_test).
 */
export function hasClerkCredentials(
  credentials: { username?: string; password?: string } = {}
): boolean {
  if (isTestAuthBypassEnabled()) {
    return getTestAuthBypassUserId() !== null;
  }

  const username =
    credentials.username ?? process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password =
    credentials.password ?? process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  return (
    username.length > 0 &&
    (password.length > 0 || isClerkTestEmail(username)) &&
    clerkSetupSuccess
  );
}

/**
 * Check if admin Clerk credentials are available.
 * Falls back to the regular test user when admin-specific credentials are absent.
 */
export function hasAdminCredentials(): boolean {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';

  if (adminUsername.length > 0) {
    return hasClerkCredentials({
      username: adminUsername,
      password: adminPassword,
    });
  }

  return hasClerkCredentials();
}

/**
 * Resolve the credential pair for admin test flows.
 * Uses admin-specific credentials when configured, otherwise falls back to the
 * regular creator test user.
 */
export function getAdminCredentials(): {
  username: string;
  password: string;
} {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';

  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail(adminUsername))
  ) {
    return { username: adminUsername, password: adminPassword };
  }

  return {
    username: process.env.E2E_CLERK_USER_USERNAME ?? '',
    password: process.env.E2E_CLERK_USER_PASSWORD ?? '',
  };
}

/**
 * Custom error types for better test debugging
 */
export class ClerkTestError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ClerkTestError';
  }
}

/**
 * Check if email is a Clerk test email (passwordless auth)
 */
export function isClerkTestEmail(email: string): boolean {
  return email.includes('+clerk_test');
}

export function isClerkHandshakeUrl(url: string): boolean {
  return (
    url.includes('clerk') &&
    (url.includes('handshake') || url.includes('dev-browser'))
  );
}

const CLERK_ORIGIN_MISMATCH_PATTERNS = [
  /production keys are only allowed for domain/i,
  /request http origin header must be equal to or a subdomain of the requesting url/i,
];

export function isClerkOriginMismatchMessage(message: string): boolean {
  return CLERK_ORIGIN_MISMATCH_PATTERNS.some(pattern => pattern.test(message));
}

export function hasClerkOriginMismatchSignal(
  errorMessage: string,
  consoleMessages: readonly string[] = []
): boolean {
  return (
    isClerkOriginMismatchMessage(errorMessage) ||
    consoleMessages.some(isClerkOriginMismatchMessage)
  );
}

function buildSeededTestUserProfile(email: string): {
  username: string;
  firstName: string;
  lastName: string;
} {
  const localPart = email.split('@')[0] ?? 'e2e';
  const baseUsername = localPart
    .replaceAll(/[^a-z0-9]+/gi, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48);

  if (localPart.startsWith('browse')) {
    return {
      username: baseUsername || 'browse-test-user',
      firstName: 'Browse',
      lastName: 'Test',
    };
  }

  return {
    username: baseUsername || 'e2e-test-user',
    firstName: 'E2E',
    lastName: 'Test',
  };
}

async function ensureClerkTestEmailUserExists(email: string): Promise<void> {
  const { username, firstName, lastName } = buildSeededTestUserProfile(email);

  await ensureClerkTestUser({
    email,
    username,
    firstName,
    lastName,
    fallbackClerkId: process.env.E2E_CLERK_USER_ID?.trim() || undefined,
    metadata: {
      role: 'e2e',
      env: 'test',
      purpose: 'Auto-provisioned Playwright auth bootstrap user',
    },
  });
}

/**
 * Sign in an existing Clerk test-email user without relying on the rendered UI.
 * This avoids flaky hidden/detached button behavior on the hosted Clerk widget.
 */
async function signInExistingTestEmailSession(
  page: Page,
  email: string
): Promise<void> {
  const result = await page.evaluate(async targetEmail => {
    const clerkInstance = (
      window as {
        Clerk?: {
          client?: {
            signIn?: {
              create?: (args: { identifier: string }) => Promise<{
                supportedFirstFactors?: Array<{
                  strategy?: string | null;
                  emailAddressId?: string | null;
                }>;
                prepareFirstFactor?: (args: {
                  strategy: 'email_code';
                  emailAddressId: string;
                }) => Promise<unknown>;
                attemptFirstFactor?: (args: {
                  strategy: 'email_code';
                  code: string;
                }) => Promise<{
                  createdSessionId?: string | null;
                  status?: string | null;
                }>;
              }>;
            };
          };
          setActive?: (args: { session: string }) => Promise<void>;
          session?: { id?: string | null } | null;
          user?: { id?: string | null } | null;
        };
      }
    ).Clerk;

    if (!clerkInstance?.client?.signIn?.create || !clerkInstance.setActive) {
      throw new Error('Clerk sign-in API not initialized');
    }

    const signIn = await clerkInstance.client.signIn.create({
      identifier: targetEmail,
    });

    const emailFactor = signIn.supportedFirstFactors?.find(
      factor =>
        factor.strategy === 'email_code' &&
        typeof factor.emailAddressId === 'string' &&
        factor.emailAddressId.length > 0
    );

    if (!emailFactor?.emailAddressId) {
      throw new Error('Clerk email_code factor unavailable for test email');
    }

    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    });

    const attempt = await signIn.attemptFirstFactor({
      strategy: 'email_code',
      code: '424242',
    });

    if (!attempt.createdSessionId) {
      throw new Error(
        `Clerk email_code sign-in completed with status "${attempt.status ?? 'unknown'}" but no session was created`
      );
    }

    await clerkInstance.setActive({ session: attempt.createdSessionId });

    return {
      sessionId: clerkInstance.session?.id ?? attempt.createdSessionId ?? null,
      userId: clerkInstance.user?.id ?? null,
    };
  }, email);

  if (!result.sessionId || !result.userId) {
    throw new Error('Clerk test-email sign-in did not activate a session');
  }
}

/**
 * Creates or reuses a Clerk test user session for the given email.
 *
 * Assumes the page has already loaded the app and Clerk has been initialized.
 */
export async function createOrReuseTestUserSession(page: Page, email: string) {
  if (!email) {
    throw new ClerkTestError(
      'E2E test user email not configured. Set E2E_CLERK_USER_USERNAME.',
      'MISSING_CREDENTIALS'
    );
  }

  await page.evaluate(
    async ({ email: targetEmail }) => {
      const clerk = (window as any).Clerk;
      if (!clerk) throw new Error('Clerk not initialized');

      // Reuse existing session if one is already active
      if (clerk.user && clerk.session) {
        return;
      }

      try {
        // Prefer signing in an existing user for this email
        const signIn = await clerk.signIn?.create({ identifier: targetEmail });

        await clerk.setActive({
          session:
            signIn?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      } catch {
        // If sign-in fails (e.g., user does not exist), create a new user
        const signUp = await clerk.signUp?.create({
          emailAddress: targetEmail,
        });

        await clerk.setActive({
          session:
            signUp?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      }
    },
    { email }
  );
}

/**
 * Per-test Clerk sign-in for tests that need fresh authentication.
 *
 * Most tests should rely on the shared storageState from auth.setup.ts instead.
 * Use this only when a test needs to re-authenticate (e.g., after sign-out,
 * or to sign in as a different user).
 *
 * Key requirements for Clerk testing:
 * 1. clerkSetup() must be called in global-setup.ts first
 * 2. Navigate to a page with ClerkProvider (e.g., /signin, NOT /)
 * 3. Use password strategy for real test users, or email_code for +clerk_test emails
 *
 * @see https://clerk.com/docs/testing/playwright/test-helpers
 */
export async function signInUser(
  page: Page,
  {
    username = process.env.E2E_CLERK_USER_USERNAME,
    password = process.env.E2E_CLERK_USER_PASSWORD,
  }: { username?: string; password?: string } = {}
) {
  if (isTestAuthBypassEnabled()) {
    await enableTestAuthBypass(page);
    await waitForShellReadyAfterAuth(page);
    return page;
  }

  if (!username) {
    throw new ClerkTestError(
      'E2E test user credentials not configured. Set E2E_CLERK_USER_USERNAME.',
      'MISSING_CREDENTIALS'
    );
  }

  // Verify that clerkSetup() succeeded in global setup
  if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    throw new ClerkTestError(
      'Clerk testing setup was not successful. Tests requiring authentication will be skipped.',
      'CLERK_SETUP_FAILED'
    );
  }

  // Clear any existing session cookies to avoid using stale JWTs
  // Clerk JWTs expire after 60 seconds, so stored sessions are usually invalid
  const cookies = await page.context().cookies();
  const clerkCookies = cookies.filter(
    cookie =>
      cookie.name.startsWith('__session') ||
      cookie.name.startsWith('__client') ||
      cookie.name.startsWith('__clerk')
  );
  if (clerkCookies.length > 0) {
    await page
      .context()
      .clearCookies({ name: new RegExp('^__(session|client|clerk)') });
  }

  // Set up Clerk testing token BEFORE navigation
  // This is required for the testing token to be included in Clerk's FAPI requests
  await setupClerkTestingToken({ page });

  const clerkConsoleMessages: string[] = [];
  const handleConsoleMessage = (message: {
    type(): string;
    text(): string;
  }) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      clerkConsoleMessages.push(message.text());
    }
  };
  page.on('console', handleConsoleMessage);

  await primeVercelBypassCookie(
    page,
    process.env.BASE_URL,
    APP_ROUTES.SIGNIN
  ).catch(() => {
    console.log(
      '  Preview bypass priming failed, continuing with direct signin'
    );
  });

  // Navigate to a page that loads ClerkProvider
  // IMPORTANT: The marketing page (/) does NOT have ClerkProvider, but /signin does
  await navigateToClerkSignIn(page);

  if (isClerkHandshakeUrl(page.url())) {
    throw new ClerkTestError(
      'Clerk redirected to a handshake flow on the current preview target.',
      'CLERK_SETUP_FAILED'
    );
  }

  // Cold local compiles can reach the auth loading shell before Clerk's sign-in
  // client API is actually ready. Wait for the concrete API surface we need.
  const clerkSignInReady = await waitForClerkSignInApi(page);
  if (!clerkSignInReady) {
    throw new ClerkTestError(
      'Clerk sign-in API never became ready on /signin.',
      'CLERK_SETUP_FAILED'
    );
  }

  try {
    // Use the official Clerk testing helper
    // The @clerk/testing library has built-in support for email_code strategy
    // with +clerk_test emails (automatically uses code 424242)
    if (username.includes('+clerk_test')) {
      await ensureClerkTestEmailUserExists(username);

      try {
        await signInExistingTestEmailSession(page, username);
      } catch (error) {
        if (isMissingClerkAccountError(error)) {
          await createOrReuseTestUserSession(page, username);
        } else {
          throw error;
        }
      }
    } else if (password) {
      // For real test users with passwords, try password strategy first,
      // then fall back to email_code if the Clerk instance disabled passwords
      try {
        await clerk.signIn({
          page,
          signInParams: {
            strategy: 'password',
            identifier: username,
            password,
          },
        });
      } catch (strategyError) {
        const strategyMsg =
          strategyError instanceof Error
            ? strategyError.message
            : String(strategyError);
        if (strategyMsg.includes('strategy')) {
          console.log(
            '  Password strategy not available, falling back to email_code'
          );
          await clerk.signIn({
            page,
            signInParams: { strategy: 'email_code', identifier: username },
          });
        } else {
          throw strategyError;
        }
      }
    } else {
      throw new ClerkTestError(
        'E2E_CLERK_USER_PASSWORD is required for non-test email addresses. ' +
          'Either provide a password or use an email with +clerk_test suffix.',
        'MISSING_CREDENTIALS'
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const sawOriginMismatch = hasClerkOriginMismatchSignal(
      msg,
      clerkConsoleMessages
    );

    // Handle "already signed in" — testing token may auto-authenticate
    if (msg.includes('already signed in')) {
      console.log('  Already signed in via testing token, continuing...');
      // Continue to verification below
    } else if (sawOriginMismatch) {
      throw new ClerkTestError(
        'Clerk rejected the current preview/local origin for the configured keys.',
        'CLERK_SETUP_FAILED'
      );
    } else {
      // Check if Clerk JS even loaded
      const clerkLoaded = await page
        .evaluate(() => {
          return typeof (window as { Clerk?: unknown }).Clerk !== 'undefined';
        })
        .catch(() => false);

      if (!clerkLoaded) {
        throw new ClerkTestError(
          'Clerk failed to initialize. This may be due to network issues loading Clerk JS from CDN.',
          'CLERK_NOT_READY'
        );
      }

      // Handle Clerk rejecting non-test emails for email_code strategy
      if (msg.includes('test email') || msg.includes('clerk_test')) {
        throw new ClerkTestError(
          `Clerk requires +clerk_test email format for email_code strategy. Current email rejected: ${msg.slice(0, 100)}`,
          'CLERK_SETUP_FAILED'
        );
      }

      // Re-throw the original error if Clerk was loaded but signIn failed
      throw error;
    }
  } finally {
    page.off('console', handleConsoleMessage);
  }

  await waitForShellReadyAfterAuth(page);

  return page;
}

/**
 * Prefer an existing persisted auth session for fast local iteration, but
 * fall back to the real Clerk sign-in flow when the stored session is stale.
 */
export async function ensureSignedInUser(
  page: Page,
  credentials?: { username?: string; password?: string }
) {
  if (process.env.E2E_USE_STORED_AUTH === '1') {
    await smokeNavigateWithRetry(page, AUTH_READY_ROUTE, {
      timeout: 120_000,
      retries: 2,
    });

    const dashNav = page.locator('nav[aria-label="Dashboard navigation"]');
    const userButton = page.locator('[data-clerk-element="userButton"]');
    const chatComposer = page
      .locator(
        'textarea, [contenteditable="true"], button:has-text("New thread")'
      )
      .first();
    const main = page.locator('main').first();
    const isShellReady = async () =>
      (page.url().includes('/app') &&
        !page.url().includes('/signin') &&
        !page.url().includes('/sign-in') &&
        !page.url().includes('/onboarding') &&
        (await main.isVisible().catch(() => false))) ||
      (await dashNav.isVisible().catch(() => false)) ||
      (await userButton.isVisible().catch(() => false)) ||
      (await chatComposer.isVisible().catch(() => false));

    let hasReloaded = false;
    const hasStoredSession = await expect(async () => {
      if (
        page.url().includes('/signin') ||
        page.url().includes('/sign-in') ||
        page.url().includes('/signup') ||
        page.url().includes('/sign-up')
      ) {
        throw new Error('Stored auth redirected to auth page');
      }

      if (!(await isShellReady())) {
        if (!hasReloaded) {
          hasReloaded = true;
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
        }
        await expect.poll(isShellReady, { timeout: 10_000 }).toBe(true);
      }
    })
      .toPass({ timeout: 30_000, intervals: [2_000, 5_000, 10_000] })
      .then(() => true)
      .catch(() => false);

    if (hasStoredSession) {
      return page;
    }
  }

  return signInUser(page, credentials);
}

/**
 * Signs out the current user
 */
export async function signOutUser(page: Page) {
  // Click user button/menu
  const userButton = page.locator('[data-clerk-element="userButton"]');
  if (await userButton.isVisible()) {
    await userButton.click();

    // Click sign out option
    const signOutButton = page.locator('button:has-text("Sign out")');
    await signOutButton.click();
  } else {
    // Fallback: navigate to sign-out URL
    await page.goto('/sign-out');
  }

  // Wait for sign out to complete
  await page.waitForURL(url => !url.pathname.includes(APP_ROUTES.DASHBOARD), {
    timeout: 10000,
  });
}

/**
 * Checks if a user is currently authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.locator('[data-clerk-element="userButton"]').waitFor({
      state: 'visible',
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a test context with authentication setup
 * Use this in beforeEach hooks for tests that require authentication
 */
export async function setupAuthenticatedTest(page: Page) {
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  // For +clerk_test emails, password is not required
  // For regular emails, password is required
  const hasTestCredentials =
    username && (username.includes('+clerk_test') || password);

  if (!hasTestCredentials) {
    console.warn(
      '⚠ Skipping authenticated test - no test user credentials configured'
    );
    throw new ClerkTestError(
      'Test user credentials not configured',
      'MISSING_CREDENTIALS'
    );
  }

  await ensureSignedInUser(page);
  return page;
}
