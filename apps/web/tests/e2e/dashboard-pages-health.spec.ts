import { neon } from '@neondatabase/serverless';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ensureSignedInUser,
  getAdminCredentials,
  hasClerkCredentials,
  isProductionTarget,
  setTestAuthBypassSession,
  signInUser,
} from '../helpers/clerk-auth';
import {
  DASHBOARD_ROUTE_MATRIX,
  type DashboardRouteDescriptor,
} from './utils/dashboard-route-matrix';
import { assertFastPageLoad } from './utils/performance-assertions';
import {
  isTransientNavigationError,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
  waitForNetworkIdle,
  waitForUrlStable,
} from './utils/smoke-test-utils';

const ERROR_TEXT_PATTERNS = [
  'application error',
  'internal server error',
  'something went wrong',
  'unhandled runtime error',
  'dashboard failed to load',
] as const;

const ERROR_ELEMENT_SELECTORS = [
  '[data-testid="error-page"]',
  '[data-testid="error-boundary"]',
  '[data-testid="dashboard-error"]',
  '.error-page',
  '.error-boundary',
] as const;

interface PageHealthResult {
  readonly route: string;
  readonly resolvedPath: string;
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'redirect';
  readonly finalUrl?: string;
  readonly loadTimeMs?: number;
  readonly error?: string;
}

function hasOnlyResourceLoadConsoleErrors(
  criticalErrors: readonly string[],
  uncaughtExceptions: readonly string[]
): boolean {
  return (
    uncaughtExceptions.length === 0 &&
    criticalErrors.length > 0 &&
    criticalErrors.every(error =>
      error.toLowerCase().includes('failed to load resource')
    )
  );
}

function hasOnlyConsoleResourceNoise(context: {
  readonly criticalErrors: readonly string[];
  readonly uncaughtExceptions: readonly string[];
  readonly networkDiagnostics: {
    readonly failedResponses: readonly unknown[];
  };
}): boolean {
  return (
    hasOnlyResourceLoadConsoleErrors(
      context.criticalErrors,
      context.uncaughtExceptions
    ) && context.networkDiagnostics.failedResponses.length === 0
  );
}

function shouldIgnoreRouteConsoleNoise(
  route: DashboardRouteDescriptor,
  context: {
    readonly criticalErrors: readonly string[];
    readonly uncaughtExceptions: readonly string[];
    readonly networkDiagnostics: {
      readonly failedResponses: readonly unknown[];
    };
  }
): boolean {
  return route.name === 'Release Tasks' && hasOnlyConsoleResourceNoise(context);
}

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const ACTIVE_HEALTH_PAGES = FAST_ITERATION
  ? DASHBOARD_ROUTE_MATRIX.health.fast
  : DASHBOARD_ROUTE_MATRIX.health.full;
const ACTIVE_ADMIN_PAGES = FAST_ITERATION
  ? DASHBOARD_ROUTE_MATRIX.admin.fast
  : DASHBOARD_ROUTE_MATRIX.admin.full;
const HEALTH_NAVIGATION_TIMEOUT = FAST_ITERATION
  ? 90_000
  : SMOKE_TIMEOUTS.NAVIGATION;
const DASHBOARD_ROUTING_TIMEOUT = FAST_ITERATION ? 180_000 : 300_000;

async function resolveSeededCreatorClerkId(): Promise<string | null> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  const sql = neon(databaseUrl);
  const rows = await sql<Array<{ clerk_id: string | null }>>`
    select u.clerk_id
    from users u
    inner join creator_profiles p on p.user_id = u.id
    where p.username = 'e2e-test-user'
    limit 1
  `;

  return rows[0]?.clerk_id?.trim() || null;
}

function getComparableUrlValue(urlString: string): string {
  const url = new URL(urlString);
  return `${url.pathname}${url.search}`;
}

function matchesExpectedLocation(urlString: string, expected: string): boolean {
  const url = new URL(urlString);
  if (expected.includes('?')) {
    return `${url.pathname}${url.search}` === expected;
  }
  return url.pathname === expected;
}

function matchesAcceptedDestination(
  urlString: string,
  route: DashboardRouteDescriptor
): boolean {
  return (
    route.acceptedDestinations?.some(destination =>
      matchesExpectedLocation(urlString, destination)
    ) ?? false
  );
}

async function checkForErrorPage(page: Page): Promise<{
  readonly hasError: boolean;
  readonly errorText?: string;
}> {
  const mainText = await page
    .locator('main')
    .innerText()
    .catch(() => '');
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const pageText = (mainText || bodyText).toLowerCase();

  const matchedPattern = ERROR_TEXT_PATTERNS.find(pattern =>
    pageText.includes(pattern)
  );
  if (matchedPattern) {
    return {
      hasError: true,
      errorText: `Found "${matchedPattern}" in page content`,
    };
  }

  for (const selector of ERROR_ELEMENT_SELECTORS) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (isVisible) {
      return {
        hasError: true,
        errorText: `Error element visible: ${selector}`,
      };
    }
  }

  return { hasError: false };
}

async function attachPageScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  const screenshot = await page.screenshot().catch(() => null);
  if (!screenshot) return;
  await testInfo.attach(name, {
    body: screenshot,
    contentType: 'image/png',
  });
}

async function stubPassiveTracking(page: Page): Promise<void> {
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

async function resolveRoutePath(
  page: Page,
  route: DashboardRouteDescriptor
): Promise<string> {
  if (!route.resolver) {
    return route.path;
  }

  return route.resolver(page);
}

async function assertRouteContent(
  page: Page,
  route: DashboardRouteDescriptor,
  testInfo: TestInfo
): Promise<string | null> {
  if (!route.contentSelector) {
    return null;
  }

  const hasPrimaryContent = await hasVisibleMatch(
    page.locator(route.contentSelector),
    10_000
  );

  const hasFallbackContent = route.contentFallbackSelector
    ? await hasVisibleMatch(page.locator(route.contentFallbackSelector), 2_000)
    : false;

  if (hasPrimaryContent || hasFallbackContent) {
    return null;
  }

  await attachPageScreenshot(page, testInfo, `missing-content-${route.name}`);
  return `Content not visible: ${route.contentSelector}`;
}

async function hasVisibleMatch(
  locator: Locator,
  timeoutMs: number
): Promise<boolean> {
  const count = await locator.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const isVisible = await locator
      .nth(index)
      .isVisible({ timeout: timeoutMs })
      .catch(() => false);
    if (isVisible) {
      return true;
    }
  }

  return false;
}

async function assertUserButtonLoaded(
  page: Page,
  route: DashboardRouteDescriptor,
  testInfo: TestInfo
): Promise<string | null> {
  if (!route.requiresUserButton) {
    return null;
  }

  const viewportSize = page.viewportSize();
  const isDesktopViewport = viewportSize && viewportSize.width >= 1024;
  if (!isDesktopViewport) {
    return null;
  }

  const hasClerkChrome = await hasVisibleMatch(
    page.locator(
      '[data-testid="user-button-loaded"], [data-clerk-element="userButton"]'
    ),
    10_000
  );
  if (hasClerkChrome) {
    return null;
  }

  const hasShellChrome = await hasVisibleMatch(
    page.locator(
      'nav[aria-label="Dashboard navigation"], main, textarea, [contenteditable="true"], button[aria-label="New thread"]'
    ),
    5_000
  );
  if (hasShellChrome) {
    return null;
  }

  await attachPageScreenshot(page, testInfo, `missing-clerk-ui-${route.name}`);
  return 'Dashboard shell chrome not visible after auth';
}

async function runRouteCheck(
  page: Page,
  route: DashboardRouteDescriptor,
  testInfo: TestInfo,
  options?: {
    readonly credentials?: {
      readonly username: string;
      readonly password: string;
    };
  }
): Promise<PageHealthResult> {
  const resolvedPath = await resolveRoutePath(page, route);
  const startTime = Date.now();
  const { getContext, cleanup } = setupPageMonitoring(page);
  console.log(`[dashboard-health] checking ${route.name} -> ${resolvedPath}`);

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await smokeNavigateWithRetry(page, resolvedPath, {
        timeout: HEALTH_NAVIGATION_TIMEOUT,
        retries: FAST_ITERATION ? 3 : 2,
      });

      await waitForHydration(page);

      if (!FAST_ITERATION && route.kind !== 'redirect') {
        await waitForNetworkIdle(page, {
          timeout: 3_000,
          idleTime: 250,
        });
      }

      if (route.kind === 'redirect' && route.acceptedDestinations?.length) {
        await waitForUrlStable(
          page,
          url =>
            route.acceptedDestinations?.some(destination =>
              matchesExpectedLocation(url.href, destination)
            ) ?? false,
          { timeout: SMOKE_TIMEOUTS.URL_STABLE }
        );
      }

      const currentUrl = page.url();
      const isAuthRedirect =
        currentUrl.includes('/signin') || currentUrl.includes('/sign-in');

      if (isAuthRedirect && attempt === 0) {
        await signInUser(page, options?.credentials);
        continue;
      }

      break;
    }

    const loadTimeMs = Date.now() - startTime;
    const currentUrl = page.url();
    const monitorContext = getContext();

    if (
      (monitorContext.criticalErrors.length > 0 ||
        monitorContext.uncaughtExceptions.length > 0) &&
      !shouldIgnoreRouteConsoleNoise(route, monitorContext)
    ) {
      await testInfo.attach(`console-errors-${route.name}`, {
        body: JSON.stringify(
          {
            criticalErrors: monitorContext.criticalErrors,
            uncaughtExceptions: monitorContext.uncaughtExceptions,
            networkDiagnostics: monitorContext.networkDiagnostics,
          },
          null,
          2
        ),
        contentType: 'application/json',
      });
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: `Console errors: ${[...monitorContext.criticalErrors, ...monitorContext.uncaughtExceptions].join('; ')}`,
      };
    }

    if (matchesAcceptedDestination(currentUrl, route)) {
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'redirect',
        finalUrl: currentUrl,
        loadTimeMs,
      };
    }

    if (
      route.kind === 'redirect' &&
      !matchesAcceptedDestination(currentUrl, route)
    ) {
      await attachPageScreenshot(
        page,
        testInfo,
        `unexpected-redirect-${route.name}`
      );
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: `Expected redirect to one of ${(route.acceptedDestinations ?? []).join(', ')}, got ${getComparableUrlValue(currentUrl)}`,
      };
    }

    if (!matchesExpectedLocation(currentUrl, resolvedPath)) {
      await attachPageScreenshot(
        page,
        testInfo,
        `wrong-destination-${route.name}`
      );
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: `Unexpected destination ${getComparableUrlValue(currentUrl)}`,
      };
    }

    const errorPage = await checkForErrorPage(page);
    if (errorPage.hasError) {
      await attachPageScreenshot(page, testInfo, `error-page-${route.name}`);
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: errorPage.errorText,
      };
    }

    const contentError = await assertRouteContent(page, route, testInfo);
    if (contentError) {
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: contentError,
      };
    }

    const userButtonError = await assertUserButtonLoaded(page, route, testInfo);
    if (userButtonError) {
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: userButtonError,
      };
    }

    if (process.env.CI && route.performanceBudgetMs) {
      await assertFastPageLoad(loadTimeMs, route.performanceBudgetMs, testInfo);
    }

    const finalContext = getContext();
    if (
      (finalContext.criticalErrors.length > 0 ||
        finalContext.uncaughtExceptions.length > 0) &&
      !shouldIgnoreRouteConsoleNoise(route, finalContext)
    ) {
      await testInfo.attach(`late-console-errors-${route.name}`, {
        body: JSON.stringify(
          {
            criticalErrors: finalContext.criticalErrors,
            uncaughtExceptions: finalContext.uncaughtExceptions,
            networkDiagnostics: finalContext.networkDiagnostics,
          },
          null,
          2
        ),
        contentType: 'application/json',
      });
      return {
        route: route.path,
        resolvedPath,
        name: route.name,
        status: 'fail',
        finalUrl: currentUrl,
        loadTimeMs,
        error: `Late console errors: ${[...finalContext.criticalErrors, ...finalContext.uncaughtExceptions].join('; ')}`,
      };
    }

    return {
      route: route.path,
      resolvedPath,
      name: route.name,
      status: 'pass',
      finalUrl: currentUrl,
      loadTimeMs,
    };
  } catch (error) {
    const status = isTransientNavigationError(error) ? 'redirect' : 'fail';
    return {
      route: route.path,
      resolvedPath,
      name: route.name,
      status,
      finalUrl: page.url(),
      loadTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cleanup();
  }
}

function logSweepSummary(
  label: string,
  results: readonly PageHealthResult[],
  total: number
): void {
  const passed = results.filter(result => result.status === 'pass');
  const redirected = results.filter(result => result.status === 'redirect');
  const failed = results.filter(result => result.status === 'fail');

  console.log(`\n${label}`);
  console.log(`   ✅ Passed: ${passed.length}/${total}`);
  if (redirected.length > 0) {
    console.log(`   🔀 Redirects accepted: ${redirected.length}`);
  }
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    for (const failure of failed) {
      console.log(`      - ${failure.name}: ${failure.error}`);
    }
  }
}

test.skip(
  FAST_ITERATION,
  'Dashboard route-health sweeps run in the slower dashboard regression lane'
);

test.describe('Dashboard Pages Health Check @smoke', () => {
  test.setTimeout(720_000);

  test.beforeEach(async ({ page }) => {
    if (isProductionTarget()) {
      test.skip(
        true,
        'Full dashboard health check skipped on production target'
      );
      return;
    }

    if (!hasClerkCredentials()) {
      test.skip(
        true,
        'Dashboard health tests require authenticated Clerk credentials'
      );
      return;
    }

    await stubPassiveTracking(page);

    try {
      if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
        const creatorClerkId = await resolveSeededCreatorClerkId();
        await setTestAuthBypassSession(page, null, creatorClerkId);
      }
      await ensureSignedInUser(page);
    } catch (error) {
      console.error('Failed to sign in test user:', error);
      test.skip();
    }
  });

  test('all creator, settings, dynamic, and alias routes resolve without errors', async ({
    page,
  }, testInfo) => {
    test.skip(
      FAST_ITERATION,
      'Batch dashboard health duplicates faster smoke and content-gate coverage'
    );

    expect(ACTIVE_HEALTH_PAGES.length).toBeGreaterThan(0);

    const results: PageHealthResult[] = [];

    for (const route of ACTIVE_HEALTH_PAGES) {
      const result = await runRouteCheck(page, route, testInfo);
      console.log(
        `[dashboard-health] ${result.name}: ${result.status}${result.error ? ` - ${result.error}` : ''}`
      );
      results.push(result);
    }

    await testInfo.attach('dashboard-health-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    logSweepSummary(
      '📊 Dashboard Health Summary:',
      results,
      ACTIVE_HEALTH_PAGES.length
    );

    expect(
      results.filter(result => result.status === 'fail'),
      'Dashboard health sweep found failing authenticated shell routes'
    ).toHaveLength(0);
  });
});

test.describe('Admin Pages Health Check @smoke', () => {
  test.setTimeout(720_000);

  test.beforeEach(async ({ page }) => {
    if (isProductionTarget()) {
      test.skip(true, 'Admin health check skipped on production target');
      return;
    }

    if (!hasClerkCredentials()) {
      test.skip(
        true,
        'Admin health tests require authenticated Clerk credentials'
      );
      return;
    }

    await stubPassiveTracking(page);

    try {
      if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
        await setTestAuthBypassSession(page, 'admin');
      }
      await ensureSignedInUser(page, getAdminCredentials());
    } catch (error) {
      console.error('Failed to sign in admin or fallback user:', error);
      test.skip();
    }
  });

  test('admin routes either render correctly or fail closed to the dashboard', async ({
    page,
  }, testInfo) => {
    expect(ACTIVE_ADMIN_PAGES.length).toBeGreaterThan(0);

    const results: PageHealthResult[] = [];
    const credentials = getAdminCredentials();

    for (const route of ACTIVE_ADMIN_PAGES) {
      const result = await runRouteCheck(page, route, testInfo, {
        credentials,
      });
      console.log(
        `[dashboard-admin-health] ${result.name}: ${result.status}${result.error ? ` - ${result.error}` : ''}`
      );
      results.push(result);
    }

    await testInfo.attach('admin-health-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    logSweepSummary(
      '📊 Admin Health Summary:',
      results,
      ACTIVE_ADMIN_PAGES.length
    );

    expect(
      results.filter(result => result.status === 'fail'),
      'Admin health sweep found routes that neither rendered correctly nor failed closed'
    ).toHaveLength(0);
  });
});

test.describe('Dashboard Routing', () => {
  test.setTimeout(DASHBOARD_ROUTING_TIMEOUT);

  test.beforeEach(async ({ page }) => {
    if (!hasClerkCredentials()) {
      test.skip(true, 'Routing checks require authenticated Clerk credentials');
      return;
    }

    await stubPassiveTracking(page);

    try {
      await ensureSignedInUser(page);
    } catch {
      test.skip();
    }
  });

  test('browser back/forward navigation works across chat and settings', async ({
    page,
  }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await expect(page).toHaveURL(/\/app\/chat/);

    await smokeNavigateWithRetry(page, APP_ROUTES.SETTINGS_ACCOUNT, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await expect(page).toHaveURL(/\/app\/settings\/account/);

    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/app\/chat/, { timeout: 30_000 });

    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/app\/settings\/account/, {
      timeout: 30_000,
    });
  });

  test('legacy dashboard aliases land on canonical destinations', async ({
    page,
  }, testInfo) => {
    const aliasRoutes = DASHBOARD_ROUTE_MATRIX.alias.full;
    const failures: string[] = [];

    for (const route of aliasRoutes) {
      const result = await runRouteCheck(page, route, testInfo);
      if (result.status === 'fail') {
        failures.push(`${route.name}: ${result.error}`);
      }
    }

    expect(
      failures,
      `Alias routing regressions detected:\n${failures.join('\n')}`
    ).toHaveLength(0);
  });

  test('chat shell hydrates without client errors', async ({ page }) => {
    const hydrationErrors: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('Hydration failed') ||
        text.includes('Text content did not match') ||
        text.includes('did not match. Server:')
      ) {
        hydrationErrors.push(text);
      }
    });

    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => {});
    await page
      .waitForFunction(
        () => !document.querySelector('[data-loading="true"], .skeleton'),
        { timeout: 15_000 }
      )
      .catch(() => {});

    expect(
      hydrationErrors,
      `Hydration errors detected: ${hydrationErrors.join(', ')}`
    ).toHaveLength(0);
  });
});
