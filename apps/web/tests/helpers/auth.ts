import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import { smokeNavigateWithRetry } from '../e2e/utils/smoke-test-utils';
import { primeVercelBypassCookie } from './vercel-preview';

// ============================================================================
// Better Auth test helper (Clerk → Better Auth migration, commit ⑩)
// ============================================================================
// Replaces the 1354-line `clerk-auth.ts` with a <400-line BA-native helper.
// Export names are preserved (`signInUser`/`ensureSignedInUser`/
// `setTestAuthBypassSession`/`isAuthenticated`/`signOutUser`/
// `setupAuthenticatedTest`/`hasClerkCredentials`/`hasAdminCredentials`/
// `ClerkTestError`/etc.) so the 51 spec importers don't churn.
//
// Under Better Auth the E2E auth path is:
//   1. Navigate to `/api/dev/test-auth/enter?persona=creator&redirect=/app`
//   2. The route mints a real BA session cookie + redirects
//   3. The page is now authenticated — no Clerk testing token, no FAPI proxy
//
// For the email OTP path: specs type `424242` (deterministic test OTP, gated
// on `E2E_TEST_MODE=1` + test-email pattern).
// ============================================================================

const AUTH_READY_ROUTE = APP_ROUTES.DASHBOARD;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 60_000;

export class ClerkTestError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'ClerkTestError';
  }
}

function isTestAuthBypassEnabled(): boolean {
  return process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
}

export function isProductionTarget(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  return vercelEnv === 'production';
}

export function isTestingEnvironment(): boolean {
  return !isProductionTarget();
}

/**
 * Under Better Auth there are no Clerk credentials to check — the dev bypass
 * route is the auth path. Kept for source compat with specs that gate on
 * `hasClerkCredentials()`. Returns `true` when the test bypass is enabled
 * (the BA equivalent of "credentials are configured").
 */
export function hasClerkCredentials(): boolean {
  return isTestAuthBypassEnabled();
}

export function hasAdminCredentials(): boolean {
  return isTestAuthBypassEnabled();
}

export function getAdminCredentials(): {
  readonly username: string;
  readonly password: string;
} {
  return {
    username: process.env.E2E_CLERK_USER_USERNAME ?? 'test-admin',
    password: process.env.E2E_CLERK_USER_PASSWORD ?? 'test-password',
  };
}

export function isClerkTestEmail(email: string): boolean {
  return /\+(e2e|clerk_test)(\+[^@]*)?@/i.test(email);
}

export function isClerkHandshakeUrl(url: string): boolean {
  // Under BA there's no Clerk handshake URL. Always false.
  void url;
  return false;
}

export function isClerkOriginMismatchMessage(message: string): boolean {
  void message;
  return false;
}

export function hasClerkOriginMismatchSignal(
  messages: readonly string[]
): boolean {
  void messages;
  return false;
}

export function canFallbackToBypassUserId(
  persona: DevTestAuthPersona | null
): boolean {
  return Boolean(
    persona ||
      process.env.E2E_BETTER_AUTH_USER_ID ||
      process.env.E2E_CLERK_USER_ID
  );
}

export function resolveBypassFallbackUserId(
  persona: DevTestAuthPersona | null,
  overrideUserId?: string | null
): string {
  if (overrideUserId) return overrideUserId;
  const envUserId =
    process.env.E2E_BETTER_AUTH_USER_ID ?? process.env.E2E_CLERK_USER_ID;
  if (envUserId) return envUserId;
  if (persona) {
    // Deterministic BA user id per persona (matches ensureBetterAuthTestUser).
    return `ba_dev_${persona}`;
  }
  throw new ClerkTestError(
    'E2E_BETTER_AUTH_USER_ID or persona is required for test auth bypass.',
    'MISSING_CREDENTIALS'
  );
}

export function resolveBypassSessionUrls(baseUrl: string): readonly string[] {
  return [baseUrl];
}

async function enableTestAuthBypass(
  page: Page,
  persona: DevTestAuthPersona = 'creator'
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const redirect = process.env.E2E_AUTH_REDIRECT ?? AUTH_READY_ROUTE;
  const enterUrl = `${baseUrl}/api/dev/test-auth/enter?persona=${persona}&redirect=${redirect}`;

  // The enter route mints a real BA session cookie and redirects to the
  // target path. Navigate to it directly — the cookie is set on the
  // same origin, so subsequent navigations are authenticated.
  await page.goto(enterUrl, { waitUntil: 'domcontentloaded' });

  // The route returns a 303 redirect to the target path. Wait for it.
  await page.waitForURL(
    url => {
      const pathname = new URL(url).pathname;
      return pathname.startsWith('/app') || pathname.startsWith('/start');
    },
    { timeout: AUTH_BOOTSTRAP_TIMEOUT_MS }
  );
}

async function waitForShellReadyAfterAuth(page: Page): Promise<void> {
  const main = page.locator('main').first();
  const chatComposer = page
    .locator('textarea, [contenteditable="true"], a[href="/app/chat"]')
    .first();

  await expect
    .poll(
      async () =>
        (await main.isVisible().catch(() => false)) ||
        (await chatComposer.isVisible().catch(() => false)),
      { timeout: 30_000, intervals: [2_000, 5_000, 10_000] }
    )
    .toBe(true);
}

export async function setTestAuthBypassSession(
  page: Page,
  persona: DevTestAuthPersona | null,
  overrideUserId?: string | null
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const userId = resolveBypassFallbackUserId(persona, overrideUserId);

  // Set the test-mode cookies directly on the browser context. This is the
  // same mechanism the Clerk-era helper used, but the user id is now the
  // BA user id (not Clerk's). The server's `getCachedDevTestAuthSession`
  // reads these cookies and resolves the app user via `betterAuthUserId`.
  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: userId,
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
  options: { readonly timeout?: number } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 30_000;
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  try {
    const response = await page.request.get(`${baseUrl}/api/health`, {
      timeout,
    });
    return response.ok();
  } catch {
    return false;
  }
}

export async function waitForClerkSignInApi(page: Page): Promise<boolean> {
  // Under Better Auth there is no Clerk sign-in API to wait for. The
  // session cookie is set by the dev bypass route. Always returns true.
  void page;
  return true;
}

export async function createOrReuseTestUserSession(
  page: Page,
  email: string
): Promise<Page> {
  void email;
  return ensureSignedInUser(page);
}

/**
 * Signs in a user for E2E tests. Under Better Auth this is the dev bypass
 * route (`/api/dev/test-auth/enter?persona=creator`). The legacy
 * username/password credential path is preserved for source compat but
// routes to the bypass when enabled (the only path under BA).
 */
export async function signInUser(
  page: Page,
  _credentials: { username?: string; password?: string } = {}
): Promise<Page> {
  if (isTestAuthBypassEnabled()) {
    const persona =
      (process.env.E2E_TEST_AUTH_PERSONA as DevTestAuthPersona) ?? 'creator';
    await enableTestAuthBypass(page, persona);
    await waitForShellReadyAfterAuth(page);
    return page;
  }

  // No bypass enabled — under BA there's no Clerk testing token path.
  // The caller must enable E2E_USE_TEST_AUTH_BYPASS=1.
  throw new ClerkTestError(
    'E2E_USE_TEST_AUTH_BYPASS=1 is required for Better Auth E2E tests.',
    'MISSING_CREDENTIALS'
  );
}

/**
 * Prefer an existing persisted auth session for fast local iteration, but
 * fall back to the bypass sign-in flow when the stored session is stale.
 */
export async function ensureSignedInUser(
  page: Page,
  _credentials?: { username?: string; password?: string }
): Promise<Page> {
  if (process.env.E2E_USE_STORED_AUTH === '1') {
    await smokeNavigateWithRetry(page, AUTH_READY_ROUTE, {
      timeout: 120_000,
      retries: 2,
    });

    const main = page.locator('main').first();
    const chatComposer = page
      .locator('textarea, [contenteditable="true"], a[href="/app/chat"]')
      .first();

    const isShellReady = async () =>
      (page.url().includes('/app') &&
        !page.url().includes('/signin') &&
        !page.url().includes('/sign-in') &&
        !page.url().includes('/onboarding') &&
        (await main.isVisible().catch(() => false))) ||
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
          await page.reload({
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          });
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

  return signInUser(page);
}

/** Signs out the current user. */
export async function signOutUser(page: Page): Promise<void> {
  // Under BA, sign out via the /api/auth/reset route (clears BA cookies)
  // or the user menu. The user menu path is preferred (matches the UX).
  const userButton = page.locator(
    '[data-testid="user-button"], [aria-label*="menu"]'
  );
  if (await userButton.isVisible().catch(() => false)) {
    await userButton.click();
    const signOutButton = page.locator(
      'button:has-text("Log out"), button:has-text("Sign out")'
    );
    if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
    } else {
      await page.goto('/api/auth/reset', { waitUntil: 'domcontentloaded' });
    }
  } else {
    // Fallback: clear session via the reset route.
    await page.goto('/api/auth/reset', { waitUntil: 'domcontentloaded' });
  }

  await page
    .waitForURL(
      url =>
        url.pathname.includes('/signin') || url.pathname.includes('/sign-in'),
      { timeout: 15_000 }
    )
    .catch(() => {
      // If the URL doesn't change, force-navigate to /signin.
      void page.goto('/signin');
    });
}

/** Checks if the current page is authenticated. */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  if (
    url.includes('/signin') ||
    url.includes('/sign-in') ||
    url.includes('/signup') ||
    url.includes('/sign-up')
  ) {
    return false;
  }

  const main = page.locator('main').first();
  return main.isVisible().catch(() => false);
}

/** Sets up an authenticated test page. */
export async function setupAuthenticatedTest(page: Page): Promise<Page> {
  await primeVercelBypassCookie(
    page,
    process.env.BASE_URL,
    APP_ROUTES.SIGNIN
  ).catch(() => undefined);
  return ensureSignedInUser(page);
}
