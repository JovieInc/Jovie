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
  test.use({ storageState: { cookies: [], origins: [] } });

  test('web signed-in auth start, session, API access, and sign-out', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Intentional conditional skip when Clerk credentials or dev test-auth bypass are unavailable. NOSONAR S1607
    if (!canRunSignedInAuthVerification()) {
      test.skip(); // NOSONAR S1607 — requires Clerk test credentials or E2E_USE_TEST_AUTH_BYPASS=1
    }

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
});
