import {
  expect,
  type Page,
  type Response,
  type TestInfo,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';
import {
  type ResolvedPublicSurfaceSpec,
  resolvePublicSurfaceManifestSync,
} from './utils/public-surface-manifest';
import {
  SMOKE_TIMEOUTS,
  waitForHydration,
  waitForNetworkIdle,
} from './utils/smoke-test-utils';

const DEFAULT_MOBILE_WIDTHS = [
  320, 360, 375, 390, 393, 402, 414, 428, 430,
] as const;
const DEFAULT_PUBLIC_BOUNDARY_WIDTHS = [320, 430] as const;
const MOBILE_HEIGHT = 844;
const FOCUS_TRAVERSAL_LIMIT = getPositiveIntegerEnv(
  'MOBILE_OVERFLOW_FOCUS_LIMIT',
  20
);
const OPEN_STATE_CLICK_LIMIT = 8;
const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const MOBILE_WIDTHS =
  getMobileWidthsFromEnv(process.env.MOBILE_OVERFLOW_WIDTHS) ??
  DEFAULT_MOBILE_WIDTHS;
const PUBLIC_BOUNDARY_WIDTHS =
  getMobileWidthsFromEnv(process.env.MOBILE_OVERFLOW_PUBLIC_WIDTHS) ??
  DEFAULT_PUBLIC_BOUNDARY_WIDTHS;
const HAS_DATABASE = Boolean(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);
const ONE_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64'
);
const SEEDED_SURFACE_FAMILIES = new Set<ResolvedPublicSurfaceSpec['family']>([
  'profile-core',
  'profile-mode',
  'release',
  'track',
  'countdown',
  'playlist-or-sounds',
  'download',
]);
const UNAVAILABLE_SURFACE_TEXT =
  /profile not found|temporarily unavailable|loading jovie profile/i;

const PUBLIC_SURFACE_IDS = [
  'home',
  'investor-pitch',
  'marketing-pricing',
  'marketing-artist-profiles',
  'marketing-artist-notifications',
  'auth-signin',
  'auth-signup',
  'profile-main',
  'profile-mode-about',
  'profile-mode-contact',
  'profile-mode-listen',
  'profile-mode-subscribe',
  'profile-mode-pay',
  'profile-mode-tour',
  'profile-notifications',
  'profile-pay',
  'profile-tip',
  'public-release',
  'public-track',
] as const;

interface MobileOverflowRoute {
  readonly id: string;
  readonly path: string;
  readonly readySelectors: readonly string[];
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMobileWidthsFromEnv(value: string | undefined) {
  const widths = value
    ?.split(',')
    .map(width => Number.parseInt(width.trim(), 10))
    .filter(width => Number.isFinite(width) && width > 0);

  return widths && widths.length > 0 ? widths : null;
}

const RESOLVED_PUBLIC_SURFACES = resolvePublicSurfaceManifestSync();

const PUBLIC_SURFACES_BY_ID = new Map(
  RESOLVED_PUBLIC_SURFACES.map(surface => [surface.id, surface])
);

const PUBLIC_SURFACES = PUBLIC_SURFACE_IDS.map(surfaceId => {
  const surface = PUBLIC_SURFACES_BY_ID.get(surfaceId);
  if (!surface) {
    throw new Error(`Missing public mobile overflow surface: ${surfaceId}`);
  }
  return surface;
});

function getPublicSurfaceFilterFromEnv(value: string | undefined) {
  const surfaceIds = value
    ?.split(',')
    .map(surfaceId => surfaceId.trim())
    .filter(Boolean);

  return surfaceIds && surfaceIds.length > 0
    ? surfaceIds
    : RESOLVED_PUBLIC_SURFACES.map(surface => surface.id);
}

const ALL_PUBLIC_SURFACES = getPublicSurfaceFilterFromEnv(
  process.env.MOBILE_OVERFLOW_PUBLIC_SURFACES
).map(surfaceId => {
  const surface = PUBLIC_SURFACES_BY_ID.get(surfaceId);
  if (!surface) {
    throw new Error(`Unknown public mobile overflow surface: ${surfaceId}`);
  }
  return surface;
});

const AUTHENTICATED_ROUTES = [
  {
    id: 'app-home',
    path: APP_ROUTES.DASHBOARD,
    readySelectors: [
      'main',
      '[data-testid="opportunity-inbox-page"]',
      '[data-testid="opportunity-inbox-feed"]',
      '[data-testid="opportunity-inbox-empty-state"]',
    ],
  },
  {
    id: 'app-chat',
    path: APP_ROUTES.CHAT,
    readySelectors: ['main', 'textarea', '[contenteditable="true"]'],
  },
  {
    id: 'app-releases',
    path: APP_ROUTES.RELEASES,
    readySelectors: [
      '[data-testid="library-surface"]',
      '[data-testid="shell-releases-view"]',
      '[data-testid="releases-matrix"]',
      '[data-testid="releases-empty-state-enriching"]',
      '[data-testid="releases-empty-state-disconnected"]',
      '[data-testid="shell-releases-empty-state-connected"]',
    ],
  },
  {
    id: 'app-audience',
    path: APP_ROUTES.AUDIENCE,
    readySelectors: ['[data-testid="dashboard-audience-client"]', 'main'],
  },
  {
    id: 'settings-account',
    path: APP_ROUTES.SETTINGS_ACCOUNT,
    readySelectors: ['section#account', 'main'],
  },
  {
    id: 'settings-artist-profile',
    path: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    readySelectors: ['section#artist-profile', 'main'],
  },
  {
    id: 'settings-billing',
    path: APP_ROUTES.SETTINGS_BILLING,
    readySelectors: ['section#billing', 'main'],
  },
] as const satisfies readonly MobileOverflowRoute[];

async function waitForAnySelector(
  page: Page,
  selectors: readonly string[],
  timeout = SMOKE_TIMEOUTS.VISIBILITY
): Promise<void> {
  try {
    await Promise.any(
      selectors.map(selector =>
        page.locator(selector).first().waitFor({
          state: 'visible',
          timeout,
        })
      )
    );
    return;
  } catch (error) {
    const errors =
      error instanceof AggregateError
        ? error.errors.map(entry =>
            entry instanceof Error ? entry.message : String(entry)
          )
        : [error instanceof Error ? error.message : String(error)];

    expect(
      errors,
      `Expected one ready selector to become visible: ${selectors.join(', ')}`
    ).toHaveLength(0);
  }
}

async function gotoRouteWithRetry(
  page: Page,
  route: MobileOverflowRoute
): Promise<Response | null> {
  const maxAttempts = 4;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      if (attempt < maxAttempts && response && response.status() >= 500) {
        await page.waitForTimeout(1_000);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts &&
        /ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ECONNREFUSED|ECONNRESET/i.test(
          message
        );
      if (shouldRetry) {
        await page.waitForTimeout(1_000 * attempt);
        continue;
      }
      if (!shouldRetry) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function navigateToPublicSurface(
  page: Page,
  surface: ResolvedPublicSurfaceSpec
): Promise<void> {
  const response = await gotoRouteWithRetry(page, {
    id: surface.id,
    path: surface.resolvedPath,
    readySelectors: surface.readySelectors,
  });

  expect(
    response?.status() ?? 200,
    `${surface.id} should not server-error`
  ).toBeLessThan(500);

  await waitForHydration(page, {
    timeout: surface.readyVisibleTimeoutMs ?? SMOKE_TIMEOUTS.VISIBILITY,
  });
  try {
    await waitForAnySelector(
      page,
      surface.readySelectors,
      surface.readyVisibleTimeoutMs ?? SMOKE_TIMEOUTS.VISIBILITY
    );
  } catch (error) {
    await skipUnavailableSeededSurface(page, surface);
    throw error;
  }
  await skipUnavailableSeededSurface(page, surface);
}

async function skipUnavailableSeededSurface(
  page: Page,
  surface: ResolvedPublicSurfaceSpec
): Promise<void> {
  if (HAS_DATABASE || !SEEDED_SURFACE_FAMILIES.has(surface.family)) {
    return;
  }

  const bodyText =
    (await page
      .locator('body')
      .textContent()
      .catch(() => '')) ?? '';
  test.skip(
    UNAVAILABLE_SURFACE_TEXT.test(bodyText),
    `${surface.id} unavailable without DATABASE_URL`
  );
}

async function stabilizeImageOptimizerRequests(page: Page): Promise<void> {
  await page.route('**/_next/image?**', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: ONE_PIXEL_GIF,
    })
  );
}

async function enterAuthenticatedRoute(
  page: Page,
  route: MobileOverflowRoute
): Promise<void> {
  test.skip(
    !USE_TEST_AUTH_BYPASS,
    'Authenticated mobile overflow routes require E2E_USE_TEST_AUTH_BYPASS=1'
  );

  await setTestAuthBypassSession(page, 'creator-ready');
  const response = await gotoRouteWithRetry(page, route);

  expect(
    response?.status() ?? 200,
    `${route.id} auth bootstrap should not server-error`
  ).toBeLessThan(500);

  await waitForHydration(page, { timeout: 60_000 });
  await waitForAnySelector(page, route.readySelectors, 60_000);
}

async function assertFocusedStatesDoNotOverflow(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  const focusableCount = await page
    .locator(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    .count();
  const focusSteps = Math.min(focusableCount, FOCUS_TRAVERSAL_LIMIT);

  for (let index = 0; index < focusSteps; index += 1) {
    await page.keyboard.press('Tab');
    await expectNoDocumentOverflow(
      page,
      testInfo,
      `${label} focus ${index + 1}`
    );
  }
}

async function assertSurfaceDoesNotOverflow(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  await waitForNetworkIdle(page, { timeout: 10_000, idleTime: 300 });
  await expectNoDocumentOverflow(page, testInfo, `${label} initial`);
  await assertFocusedStatesDoNotOverflow(page, testInfo, label);
}

async function clickFirstVisible(
  page: Page,
  selectors: readonly string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }

  return false;
}

test.describe('Mobile Overflow', () => {
  test.use({
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    storageState: { cookies: [], origins: [] },
  });

  test.describe('Mobile Overflow Release Guard', () => {
    test.setTimeout(120_000);

    for (const width of MOBILE_WIDTHS) {
      test.describe(`${width}px`, () => {
        test.use({ viewport: { width, height: MOBILE_HEIGHT } });

        for (const surface of PUBLIC_SURFACES) {
          test(`public ${surface.id} has no horizontal overflow @ ${width}px`, async ({
            page,
          }, testInfo) => {
            await navigateToPublicSurface(page, surface);
            await assertSurfaceDoesNotOverflow(
              page,
              testInfo,
              `${surface.id} ${width}px`
            );
          });
        }

        for (const route of AUTHENTICATED_ROUTES) {
          test(`authenticated ${route.id} has no horizontal overflow @ ${width}px`, async ({
            page,
          }, testInfo) => {
            await enterAuthenticatedRoute(page, route);
            await assertSurfaceDoesNotOverflow(
              page,
              testInfo,
              `${route.id} ${width}px`
            );
          });
        }
      });
    }
  });

  test.describe('All Public Surface Boundary Guard', () => {
    test.describe.configure({ mode: 'parallel' });
    test.setTimeout(180_000);

    for (const width of PUBLIC_BOUNDARY_WIDTHS) {
      test.describe(`${width}px`, () => {
        test.use({ viewport: { width, height: MOBILE_HEIGHT } });

        for (const surface of ALL_PUBLIC_SURFACES) {
          test(`public boundary ${surface.id} has no horizontal overflow @ ${width}px`, async ({
            page,
          }, testInfo) => {
            await stabilizeImageOptimizerRequests(page);
            await navigateToPublicSurface(page, surface);
            await assertSurfaceDoesNotOverflow(
              page,
              testInfo,
              `${surface.id} ${width}px`
            );
          });
        }
      });
    }
  });

  test.describe('Mobile Overflow Open States', () => {
    test.use({ viewport: { width: 390, height: MOBILE_HEIGHT } });

    test('homepage mobile navigation does not overflow', async ({
      page,
    }, testInfo) => {
      const home = PUBLIC_SURFACES_BY_ID.get('home');
      expect(home, 'Expected home surface in public manifest').toBeTruthy();

      await navigateToPublicSurface(page, home as ResolvedPublicSurfaceSpec);
      await expectNoDocumentOverflow(page, testInfo, 'home before nav open');

      await clickFirstVisible(page, [
        'button[aria-label*="menu" i]',
        'button[aria-label*="navigation" i]',
        'button[aria-expanded="false"]',
      ]);

      await expectNoDocumentOverflow(page, testInfo, 'home nav open state');
    });

    test('profile mobile drawers do not overflow', async ({
      page,
    }, testInfo) => {
      const profile = PUBLIC_SURFACES_BY_ID.get('profile-main');
      expect(
        profile,
        'Expected profile-main surface in public manifest'
      ).toBeTruthy();

      await navigateToPublicSurface(page, profile as ResolvedPublicSurfaceSpec);
      await expectNoDocumentOverflow(
        page,
        testInfo,
        'profile before open states'
      );

      const triggers = page.locator(
        [
          '[data-testid^="profile-primary-tab-"]',
          'a[href*="mode="]',
          'button[aria-haspopup="dialog"]',
          'button[aria-label*="contact" i]',
          'button[aria-label*="tip" i]',
          'button[aria-label*="pay" i]',
        ].join(', ')
      );
      const count = Math.min(await triggers.count(), OPEN_STATE_CLICK_LIMIT);

      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        if (!(await trigger.isVisible().catch(() => false))) continue;

        await trigger.click({ timeout: 10_000 }).catch(() => {});
        await waitForHydration(page, { timeout: 15_000 });
        await expectNoDocumentOverflow(
          page,
          testInfo,
          `profile open state ${index + 1}`
        );
        await page.keyboard.press('Escape').catch(() => {});
      }
    });

    test('dashboard menus and dialogs do not overflow', async ({
      page,
    }, testInfo) => {
      await enterAuthenticatedRoute(page, AUTHENTICATED_ROUTES[0]);
      await expectNoDocumentOverflow(
        page,
        testInfo,
        'dashboard before open states'
      );

      const triggers = page.locator(
        [
          'button[aria-haspopup="menu"]:not([disabled])',
          'button[aria-haspopup="dialog"]:not([disabled])',
          'button[aria-expanded="false"]:not([disabled])',
        ].join(', ')
      );
      const count = Math.min(await triggers.count(), OPEN_STATE_CLICK_LIMIT);

      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        if (!(await trigger.isVisible().catch(() => false))) continue;

        await trigger.click({ timeout: 10_000 }).catch(() => {});
        await waitForHydration(page, { timeout: 15_000 });
        await expectNoDocumentOverflow(
          page,
          testInfo,
          `dashboard open state ${index + 1}`
        );
        await page.keyboard.press('Escape').catch(() => {});
      }
    });
  });
});
