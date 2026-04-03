import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import { assertFastPageLoad } from './utils/performance-assertions';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
  waitForNetworkIdle,
} from './utils/smoke-test-utils';

const REAL_ROUTE = '/app/dashboard/releases';
const DEMO_ROUTE = '/demo/showcase/releases';
const RELEASES_ROUTE_BUDGET_MS = 12_000;

type ReleasesSurface = 'desktop' | 'mobile';
type ReleaseState =
  | 'populated'
  | 'disconnected'
  | 'connected-empty'
  | 'importing'
  | 'failed'
  | 'partial'
  | 'unknown';

async function stubPassiveTracking(page: import('@playwright/test').Page) {
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

async function resolveReleasesSurface(
  page: import('@playwright/test').Page
): Promise<ReleasesSurface | null> {
  const mobileRows = page.locator('[data-testid^="mobile-release-row-"]');
  if (
    await mobileRows
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    return 'mobile';
  }

  const desktopRows = page.locator('tbody tr');
  if (
    await desktopRows
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    return 'desktop';
  }

  return null;
}

async function assertPopulatedRoute(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('releases-matrix')).toBeVisible();
  const rows = page.locator(
    '[data-testid^="mobile-release-row-"], [data-testid^="release-open-"], tbody tr'
  );
  expect(await rows.count()).toBeGreaterThan(0);
}

async function resolveReleaseState(
  page: import('@playwright/test').Page
): Promise<ReleaseState> {
  if ((await resolveReleasesSurface(page)) !== null) {
    return 'populated';
  }

  const candidates = [
    ['disconnected', page.getByTestId('releases-empty-state-disconnected')],
    ['disconnected', page.getByRole('heading', { name: 'Connect Spotify' })],
    ['connected-empty', page.getByText('No releases yet')],
    ['importing', page.getByTestId('spotify-import-progress-banner')],
    ['failed', page.getByTestId('releases-empty-state-failed')],
    ['partial', page.getByTestId('releases-empty-state-partial')],
  ] as const;

  for (const [state, locator] of candidates) {
    if (await locator.isVisible().catch(() => false)) {
      return state;
    }
  }

  return 'unknown';
}

function collectSameOriginApiFailures(
  pageUrl: string,
  responses: ReadonlyArray<{ url: string; status: number }>
) {
  const host = new URL(pageUrl).hostname;
  return responses.filter(response => {
    if (response.status === 401 || response.status === 403) {
      return false;
    }

    try {
      const url = new URL(response.url);
      return (
        url.hostname === host &&
        (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/'))
      );
    } catch {
      return false;
    }
  });
}

async function assertAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function assertDemoFixtureState(
  page: import('@playwright/test').Page,
  state: Exclude<ReleaseState, 'unknown'>
) {
  if (state === 'populated') {
    await assertPopulatedRoute(page);
    return;
  }

  if (state === 'disconnected') {
    await expect(
      page.getByRole('heading', { name: 'Connect Spotify' })
    ).toBeVisible();
    return;
  }

  if (state === 'connected-empty') {
    await expect(page.getByText('No releases yet')).toBeVisible();
    return;
  }

  if (state === 'importing') {
    await expect(
      page.getByTestId('spotify-import-progress-banner')
    ).toBeVisible();
    return;
  }

  if (state === 'failed') {
    await expect(page.getByTestId('releases-empty-state-failed')).toBeVisible();
    return;
  }

  await expect(page.getByTestId('releases-empty-state-partial')).toBeVisible();
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Releases Dashboard Health', () => {
  test.setTimeout(240_000);

  test('real route stays healthy and exposes an explicit content state', async ({
    page,
  }, testInfo) => {
    if (!hasClerkCredentials()) {
      test.skip(
        true,
        'Authenticated releases health requires Clerk credentials'
      );
      return;
    }

    await stubPassiveTracking(page);
    await ensureSignedInUser(page);
    const { getContext, cleanup } = setupPageMonitoring(page);
    const startedAt = Date.now();

    try {
      await smokeNavigateWithRetry(page, REAL_ROUTE, {
        timeout: 90_000,
        retries: 2,
      });
      await waitForHydration(page);
      await waitForNetworkIdle(page, { timeout: 5_000, idleTime: 250 });

      await expect(page.locator('main').first()).toBeVisible();
      await expect(
        page.locator(
          '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
        )
      ).toHaveCount(0);

      const state = await resolveReleaseState(page);
      expect(
        ['populated', 'disconnected', 'connected-empty', 'importing'],
        `Unexpected releases state: ${state}`
      ).toContain(state);

      const context = getContext();
      const apiFailures = collectSameOriginApiFailures(
        page.url(),
        context.networkDiagnostics.failedResponses
      );

      await testInfo.attach('release-health-state', {
        body: state,
        contentType: 'text/plain',
      });

      await assertFastPageLoad(
        Date.now() - startedAt,
        RELEASES_ROUTE_BUDGET_MS,
        testInfo
      );
      await assertNoCriticalErrors(context, testInfo);
      expect(apiFailures, JSON.stringify(apiFailures, null, 2)).toEqual([]);
      await assertAccessible(page);
    } finally {
      cleanup();
    }
  });

  for (const state of [
    'populated',
    'disconnected',
    'connected-empty',
    'importing',
    'failed',
    'partial',
  ] as const) {
    test(`demo fixture state ${state} renders cleanly`, async ({
      page,
    }, testInfo) => {
      await stubPassiveTracking(page);
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await page.goto(`${DEMO_ROUTE}?state=${state}`, {
          waitUntil: 'domcontentloaded',
          timeout: 90_000,
        });
        await waitForHydration(page);
        await assertDemoFixtureState(page, state);

        await expect(
          page.locator(
            '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
          )
        ).toHaveCount(0);

        const context = getContext();
        const apiFailures = collectSameOriginApiFailures(
          page.url(),
          context.networkDiagnostics.failedResponses
        );
        await assertNoCriticalErrors(context, testInfo);
        expect(apiFailures, JSON.stringify(apiFailures, null, 2)).toEqual([]);
        await assertAccessible(page);
      } finally {
        cleanup();
      }
    });
  }
});
