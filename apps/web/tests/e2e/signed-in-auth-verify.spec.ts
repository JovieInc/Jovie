import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, signInUser } from '../helpers/clerk-auth';
import {
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigateWithRetry,
} from './utils/smoke-test-utils';

const TEST_AUTH_BYPASS_ENABLED = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

function hasRealClerkConfig(): boolean {
  if (TEST_AUTH_BYPASS_ENABLED) {
    return true;
  }

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const sk = process.env.CLERK_SECRET_KEY ?? '';
  return (
    pk.length > 0 &&
    sk.length > 0 &&
    !pk.toLowerCase().includes('dummy') &&
    !pk.toLowerCase().includes('mock') &&
    !sk.toLowerCase().includes('dummy') &&
    !sk.toLowerCase().includes('mock')
  );
}

function canRunSignedInAuthVerification(): boolean {
  if (TEST_AUTH_BYPASS_ENABLED) {
    return true;
  }

  return (
    hasRealClerkConfig() &&
    Boolean(process.env.E2E_CLERK_USER_USERNAME) &&
    process.env.CLERK_TESTING_SETUP_SUCCESS === 'true'
  );
}

async function bootstrapSignedInSession(page: import('@playwright/test').Page) {
  if (TEST_AUTH_BYPASS_ENABLED) {
    await smokeNavigateWithRetry(
      page,
      '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/chat'
    );
    await expect(page).toHaveURL(/\/app\/chat/, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    return;
  }

  await signInUser(page);
  await ensureSignedInUser(page);
}

async function assertAuthenticatedApiAccess(
  page: import('@playwright/test').Page
) {
  if (TEST_AUTH_BYPASS_ENABLED) {
    const sessionProbe = await page.request.post('/api/dev/test-auth/session', {
      headers: {
        'Content-Type': 'application/json',
        'x-test-mode': 'bypass-auth',
      },
      data: { persona: 'creator-ready' },
    });

    expect(sessionProbe.ok()).toBeTruthy();
    const payload = (await sessionProbe.json()) as { userId?: string };
    expect(payload.userId?.trim().length).toBeGreaterThan(0);
    return;
  }

  const userId = await page.evaluate(() => {
    const clerkWindow = window as {
      Clerk?: { user?: { id?: string | null } | null };
    };
    return clerkWindow.Clerk?.user?.id ?? null;
  });

  expect(userId?.trim().length).toBeGreaterThan(0);
}

/**
 * Web signed-in auth verification harness (JOV-2761).
 *
 * Covers session bootstrap, authenticated app access, API/session proof, and sign-out.
 * iOS, Electron, and Chrome extension surfaces are tracked as follow-up evidence.
 *
 * @smoke
 */
test.describe('Signed-in auth verification @smoke', () => {
  // Intentional conditional skip when Clerk credentials or dev test-auth bypass are unavailable. NOSONAR S1607
  test.skip(
    !canRunSignedInAuthVerification(),
    'Requires Clerk test credentials or E2E_USE_TEST_AUTH_BYPASS=1'
  ); // NOSONAR

  test.use({ storageState: { cookies: [], origins: [] } });

  test('web signed-in auth start, session, API access, and sign-out', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await bootstrapSignedInSession(page);

      const main = page.locator('main').first();
      await expect(main, 'Authenticated app shell did not render').toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await assertAuthenticatedApiAccess(page);

      if (TEST_AUTH_BYPASS_ENABLED) {
        await smokeNavigateWithRetry(page, APP_ROUTES.SIGNIN);
        await expect(page).toHaveURL(/\/signin/, {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
      } else {
        await page.evaluate(async () => {
          const clerkWindow = window as {
            Clerk?: { signOut?: () => Promise<void> };
          };
          await clerkWindow.Clerk?.signOut?.();
        });

        await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD);
        await expect(page).toHaveURL(/\/signin|\/signup|\/start/, {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
      }

      const context = getContext();
      expect(
        context.pageErrors,
        'Signed-in auth verification page errors'
      ).toEqual([]);
      expect(
        context.consoleErrors,
        'Signed-in auth verification console errors'
      ).toEqual([]);
    } finally {
      cleanup();
    }
  });

  // Electron return path (prod Mac login fix). The Mac app sends the user to the
  // web to sign in; on success the web must bounce them BACK to the app via the
  // jovie:// deep link, not leave them on the web /app. This walks the real
  // server chain in a browser: /auth/start (electron) -> /auth/callback ->
  // /auth/native-return with an "Open Jovie" jovie:// link. The final OS
  // deep-link handoff into the notarized app is the only step not automatable
  // here (tracked in JOV-3507).
  test('electron sign-in returns to the app via the native-return bounce, not the web app', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { cleanup } = setupPageMonitoring(page);

    try {
      // Establish an authenticated browser context (cookies shared with page.request).
      await bootstrapSignedInSession(page);

      const codeChallenge = 'AnbivgIKxV6Dz4JKlerQLNduBe4AJ-ACgu63xx7m4_A';
      const desktopFlow = 'htmjTw7x7kSYKEPuInDfGOJ0U9q56p4Y';
      const startUrl =
        '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp' +
        `&code_challenge=${codeChallenge}&code_challenge_method=S256` +
        `&desktop_flow=${desktopFlow}`;

      // Capture every response in the chain. The authed server flow is:
      // /auth/start (electron) -> /auth/callback -> /auth/native-return (200),
      // then the bounce page client-fires the jovie:// deep link. Server 307s
      // chain onto a single request, so we watch responses (one per hop) and
      // assert on the final document regardless of the racing custom-scheme nav.
      const toUrl = (raw: string): URL | null => {
        try {
          return new URL(raw);
        } catch {
          return null;
        }
      };
      const respPaths: URL[] = [];
      let authStartStatus: number | null = null;
      page.on('response', response => {
        const url = toUrl(response.url());
        if (!url) return;
        respPaths.push(url);
        if (url.pathname === '/auth/start') authStartStatus = response.status();
      });

      // jovie:// is unhandled in headless chromium and rejects the navigation.
      await page.goto(startUrl, { waitUntil: 'commit' }).catch(() => undefined);
      await page.waitForTimeout(1500);

      // /auth/start persists PKCE state to a durable store; when that store is
      // unavailable in the env it fails closed with 503 and the flow can't be
      // exercised. Skip rather than flake — the bounce logic itself is covered
      // deterministically by the callback route + native-return page unit tests.
      test.skip(
        authStartStatus === 503,
        'auth-state store unavailable (/auth/start 503) in this environment'
      );

      const nativeReturn = respPaths.find(
        url => url.pathname === '/auth/native-return'
      );

      // The flow must reach the bounce page (return INTO the app)…
      expect(
        nativeReturn,
        'electron auth must bounce through /auth/native-return'
      ).toBeDefined();
      // …carrying the exact params the jovie:// deep link is built from…
      expect(nativeReturn?.searchParams.get('code')).toMatch(/^[a-f0-9]+$/);
      expect(nativeReturn?.searchParams.get('state')).toMatch(/^[a-f0-9]+$/);
      expect(nativeReturn?.searchParams.get('desktop_flow')).toBe(desktopFlow);
      // …and must NEVER strand the user on a web app document (the boundary break).
      expect(
        respPaths.some(url => /^\/app(\/|$)/.test(url.pathname)),
        'electron auth must not land on the web /app'
      ).toBe(false);
    } finally {
      cleanup();
    }
  });
});
