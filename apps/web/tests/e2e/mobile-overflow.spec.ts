import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
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

test.use({
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  storageState: { cookies: [], origins: [] },
});

const MOBILE_WIDTHS = [320, 360, 375, 390, 393, 402, 414, 428, 430] as const;
const MOBILE_HEIGHT = 844;
const FOCUS_TRAVERSAL_LIMIT = 20;
const OPEN_STATE_CLICK_LIMIT = 8;
const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

const PUBLIC_SURFACE_IDS = [
  'home',
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
  'profile-tip',
  'public-release',
  'public-track',
] as const;

interface MobileOverflowRoute {
  readonly id: string;
  readonly path: string;
  readonly readySelectors: readonly string[];
}

const PUBLIC_SURFACES_BY_ID = new Map(
  resolvePublicSurfaceManifestSync().map(surface => [surface.id, surface])
);

const PUBLIC_SURFACES = PUBLIC_SURFACE_IDS.map(surfaceId => {
  const surface = PUBLIC_SURFACES_BY_ID.get(surfaceId);
  if (!surface) {
    throw new Error(`Missing public mobile overflow surface: ${surfaceId}`);
  }
  return surface;
});

const AUTHENTICATED_ROUTES = [
  {
    id: 'app-home',
    path: APP_ROUTES.DASHBOARD,
    readySelectors: ['main', 'textarea', '[contenteditable="true"]'],
  },
  {
    id: 'app-chat',
    path: APP_ROUTES.CHAT,
    readySelectors: ['main', 'textarea', '[contenteditable="true"]'],
  },
  {
    id: 'app-releases',
    path: APP_ROUTES.DASHBOARD_RELEASES,
    readySelectors: [
      '[data-testid="releases-matrix"]',
      '[data-testid="releases-empty-state-enriching"]',
      'main',
    ],
  },
  {
    id: 'app-audience',
    path: APP_ROUTES.DASHBOARD_AUDIENCE,
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
  const errors: string[] = [];

  for (const selector of selectors) {
    try {
      await page
        .locator(selector)
        .first()
        .waitFor({
          state: 'visible',
          timeout: Math.min(timeout, 12_000),
        });
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  expect(
    errors,
    `Expected one ready selector to become visible: ${selectors.join(', ')}`
  ).toHaveLength(0);
}

async function navigateToPublicSurface(
  page: Page,
  surface: ResolvedPublicSurfaceSpec
): Promise<void> {
  const response = await page.goto(surface.resolvedPath, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  expect(
    response?.status() ?? 200,
    `${surface.id} should not server-error`
  ).toBeLessThan(500);

  await waitForHydration(page, {
    timeout: surface.readyVisibleTimeoutMs ?? SMOKE_TIMEOUTS.VISIBILITY,
  });
  await waitForAnySelector(
    page,
    surface.readySelectors,
    surface.readyVisibleTimeoutMs ?? SMOKE_TIMEOUTS.VISIBILITY
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

  const authEntryPath = `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(
    route.path
  )}`;

  const response = await page.goto(authEntryPath, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

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

  test('profile mobile drawers do not overflow', async ({ page }, testInfo) => {
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
