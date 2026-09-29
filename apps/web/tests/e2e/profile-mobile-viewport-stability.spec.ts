import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { resetOwnedOutputDirectory } from '../../scripts/owned-output-path';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';
import {
  MOBILE_PROFILE_VIEWPORTS,
  type MobileProfileViewport,
} from './utils/mobile-profile-viewports';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

test.use({
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  storageState: { cookies: [], origins: [] },
});
test.describe.configure({ mode: 'serial' });

const WEB_ROOT = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : path.resolve(process.cwd(), 'apps/web');
const PROFILE_MOBILE_OUTPUT_BASE = path.resolve(WEB_ROOT, '../../.context');
const PROFILE_MOBILE_OUTPUT_SEGMENT = 'profile-mobile-qa';
const PROFILE_MOBILE_OUTPUT_ROOT = path.join(
  PROFILE_MOBILE_OUTPUT_BASE,
  PROFILE_MOBILE_OUTPUT_SEGMENT
);

test.beforeAll(async () => {
  if (process.env.PROFILE_MOBILE_SCREENSHOTS !== '1') return;

  await resetOwnedOutputDirectory(
    PROFILE_MOBILE_OUTPUT_BASE,
    PROFILE_MOBILE_OUTPUT_SEGMENT,
    'PROFILE_MOBILE_SCREENSHOTS'
  );
});

type MobileProfileScreen = {
  readonly id: string;
  readonly path: string;
  readonly rootSelector: string;
  readonly readySelectors: readonly string[];
};

const PROFILE_MOBILE_SCREENS = [
  {
    id: 'home',
    path: `/${TEST_PROFILES.DUALIPA}`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: ['[data-testid="profile-header"]'],
  },
  {
    id: 'music',
    path: `/${TEST_PROFILES.DUALIPA}?mode=listen`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-primary-tab-releases"]',
      '[data-testid="profile-primary-tab-listen"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'events',
    path: `/${TEST_PROFILES.DUALIPA}?mode=tour`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-primary-tab-tour"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'alerts',
    path: `/${TEST_PROFILES.DUALIPA}?mode=subscribe`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-alerts-settings"]',
      '[data-testid="profile-primary-tab-subscribe"]',
    ],
  },
  {
    id: 'about',
    path: `/${TEST_PROFILES.DUALIPA}?mode=about`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-primary-tab-about"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'contact',
    path: `/${TEST_PROFILES.DUALIPA}?mode=contact`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-mode-drawer-contact"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'pay',
    path: '/testartist?mode=pay',
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-mode-drawer-pay"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'releases',
    path: `/${TEST_PROFILES.DUALIPA}?mode=releases`,
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-primary-tab-releases"]',
      '[data-testid="profile-header"]',
    ],
  },
  {
    id: 'notifications',
    path: '/testartist?mode=subscribe',
    rootSelector: '[data-testid="profile-compact-surface"]',
    readySelectors: [
      '[data-testid="profile-mobile-notifications-step-email"]',
      '[data-testid="profile-primary-tab-subscribe"]',
    ],
  },
] as const satisfies readonly MobileProfileScreen[];

type ViewportSnapshot = {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly horizontalOverflow: number;
  readonly verticalOverflow: number;
  readonly activeFontSize: number | null;
  readonly activeTagName: string | null;
  readonly visualViewport: {
    readonly width: number;
    readonly height: number;
    readonly offsetTop: number;
    readonly scale: number;
  } | null;
  readonly root: {
    readonly top: number;
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  };
};

type NavigationBudget = {
  readonly domContentLoaded: number;
};

const DEFAULT_NAVIGATION_BUDGET: NavigationBudget = {
  domContentLoaded: 8000,
};

const ALERTS_NAVIGATION_BUDGET: NavigationBudget = {
  domContentLoaded: 9000,
};

const UTILITY_NAVIGATION_BUDGET: NavigationBudget = {
  domContentLoaded: 12000,
};

function shouldAssertPerformanceBudgets() {
  return process.env.PROFILE_MOBILE_PERF_BUDGETS === '1';
}

function getNavigationBudget(screenId: MobileProfileScreen['id']) {
  if (screenId === 'alerts' || screenId === 'notifications') {
    return ALERTS_NAVIGATION_BUDGET;
  }

  if (screenId === 'contact' || screenId === 'pay') {
    return UTILITY_NAVIGATION_BUDGET;
  }

  return DEFAULT_NAVIGATION_BUDGET;
}

async function installProfileMocks(page: Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit-token*', route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ token: null, expiresAt: null }),
    })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
}

async function installNotificationFlowMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem('jovie:notification-contacts');
    window.localStorage.removeItem('jovie:notification-status-cache');
  });
  await page.route('**/api/notifications/status', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        channels: { email: false, sms: false },
        details: { email: null, phone: null },
      }),
    })
  );
  await page.route('**/api/notifications/subscribe', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pendingConfirmation: true }),
    })
  );
  await page.route('**/api/notifications/verify-email-otp', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/update-name', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/update-birthday', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );
  await page.route('**/api/notifications/preferences', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, updated: 1 }),
    })
  );
}

async function warmProfileRouteForBudget(page: Page, pathName: string) {
  if (!shouldAssertPerformanceBudgets()) return;

  const response = await page.request.get(pathName, {
    failOnStatusCode: false,
    timeout: 120_000,
  });

  expect(
    response.status(),
    `${pathName} warmup should not server-error before measuring budget`
  ).toBeLessThan(500);
}

async function expectNavigationBudget(
  page: Page,
  budget: NavigationBudget,
  label: string
) {
  if (!shouldAssertPerformanceBudgets()) return;

  const timings = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;

    if (!navigation) return null;

    return {
      domContentLoaded:
        navigation.domContentLoadedEventEnd - navigation.startTime,
      load:
        navigation.loadEventEnd > 0
          ? navigation.loadEventEnd - navigation.startTime
          : navigation.domContentLoadedEventEnd - navigation.startTime,
    };
  });

  expect(timings, `${label} should expose navigation timing`).not.toBeNull();
  if (!timings) return;

  expect(
    timings.domContentLoaded,
    `${label} DOMContentLoaded exceeded mobile profile budget`
  ).toBeLessThanOrEqual(budget.domContentLoaded);
}

async function waitForAnyVisible(
  page: Page,
  selectors: readonly string[],
  timeout = SMOKE_TIMEOUTS.VISIBILITY
) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) return selector;
    }
    await page.waitForTimeout(150);
  }

  throw new Error(`None of these selectors became visible: ${selectors}`);
}

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    // WebKit can leave FontFaceSet.ready pending across repeated viewport
    // navigations even after the set has reached its terminal loaded state.
    if ('fonts' in document && document.fonts.status === 'loading') {
      await document.fonts.ready;
    }
  });
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
  );
}

async function collectViewportSnapshot(
  page: Page,
  rootSelector: string
): Promise<ViewportSnapshot> {
  return page.evaluate(selector => {
    const root =
      document.querySelector<HTMLElement>(selector) ??
      document.querySelector<HTMLElement>(
        '[data-testid="profile-compact-surface"]'
      ) ??
      document.body;
    const rootRect = root.getBoundingClientRect();
    const activeElement = document.activeElement as HTMLElement | null;
    const activeStyle = activeElement
      ? window.getComputedStyle(activeElement)
      : null;
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const documentHeight = document.documentElement.scrollHeight;
    const bodyHeight = document.body.scrollHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      horizontalOverflow: Math.max(documentWidth, bodyWidth) - viewportWidth,
      verticalOverflow: Math.max(documentHeight, bodyHeight) - viewportHeight,
      activeFontSize: activeStyle
        ? Number.parseFloat(activeStyle.fontSize)
        : null,
      activeTagName: activeElement?.tagName ?? null,
      visualViewport: window.visualViewport
        ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            offsetTop: window.visualViewport.offsetTop,
            scale: window.visualViewport.scale,
          }
        : null,
      root: {
        top: rootRect.top,
        left: rootRect.left,
        right: rootRect.right,
        bottom: rootRect.bottom,
        width: rootRect.width,
        height: rootRect.height,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
    };
  }, rootSelector);
}

function expectMobileShellStable(
  snapshot: ViewportSnapshot,
  viewport: MobileProfileViewport,
  label: string
) {
  expect(snapshot.innerWidth, `${label} should keep viewport width`).toBe(
    viewport.width
  );
  expect(
    snapshot.horizontalOverflow,
    `${label} should not introduce horizontal page overflow`
  ).toBeLessThanOrEqual(2);
  expect(
    snapshot.root.left,
    `${label} root should stay left-aligned`
  ).toBeGreaterThanOrEqual(-1);
  expect(
    snapshot.root.right,
    `${label} root should not exceed viewport`
  ).toBeLessThanOrEqual(snapshot.innerWidth + 1);
  expect(
    snapshot.root.top,
    `${label} root should stay pinned to top`
  ).toBeGreaterThanOrEqual(-1);
  expect(
    snapshot.root.bottom,
    `${label} root should fill viewport`
  ).toBeGreaterThanOrEqual(snapshot.innerHeight - 2);
  expect(
    snapshot.root.bottom,
    `${label} root should not grow below viewport`
  ).toBeLessThanOrEqual(snapshot.innerHeight + 2);
  expect(snapshot.scrollY, `${label} page should not vertically scroll`).toBe(
    0
  );
  expect(
    snapshot.verticalOverflow,
    `${label} should not introduce vertical page overflow`
  ).toBeLessThanOrEqual(2);
  expect(
    snapshot.root.scrollHeight - snapshot.root.clientHeight,
    `${label} compact shell should not need its own vertical scroll`
  ).toBeLessThanOrEqual(2);
}

function expectNoFocusShift(
  before: ViewportSnapshot,
  after: ViewportSnapshot,
  label: string
) {
  expect(after.innerWidth, `${label} focus changed viewport width`).toBe(
    before.innerWidth
  );
  expect(
    after.innerHeight,
    `${label} focus changed layout viewport height`
  ).toBe(before.innerHeight);
  expect(after.scrollX, `${label} focus changed page scrollX`).toBe(
    before.scrollX
  );
  expect(
    Math.abs(after.scrollY - before.scrollY),
    `${label} focus scrolled page`
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(after.root.top - before.root.top),
    `${label} focus shifted the profile shell vertically`
  ).toBeLessThanOrEqual(2);
  expect(
    after.horizontalOverflow,
    `${label} focus introduced horizontal overflow`
  ).toBeLessThanOrEqual(2);

  if (after.visualViewport) {
    expect(
      after.visualViewport.scale,
      `${label} should not trigger iOS zoom`
    ).toBe(1);
  }

  expect(
    after.activeFontSize,
    `${label} focused control needs >=16px text to avoid iOS input zoom`
  ).toBeGreaterThanOrEqual(16);
}

async function maybeCaptureScreenshot(
  page: Page,
  viewport: MobileProfileViewport,
  screenId: string,
  testInfo: TestInfo
) {
  if (process.env.PROFILE_MOBILE_SCREENSHOTS !== '1') return;

  const filePath = path.join(
    PROFILE_MOBILE_OUTPUT_ROOT,
    `${viewport.id}-${screenId}.png`
  );

  await page.screenshot({
    path: filePath,
    fullPage: false,
  });

  await testInfo.attach(`${viewport.id}-${screenId}`, {
    path: filePath,
    contentType: 'image/png',
  });
}

async function focusAndAssertNoShift(
  page: Page,
  target: Locator,
  rootSelector: string,
  label: string
) {
  await expect(target, `${label} target should be visible`).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settleLayout(page);
  const before = await collectViewportSnapshot(page, rootSelector);

  await target.click();
  await expect(target, `${label} target should receive focus`).toBeFocused();
  await settleLayout(page);

  const after = await collectViewportSnapshot(page, rootSelector);
  expectNoFocusShift(before, after, label);
}

const MOCK_HOME_RELEASE_CARD_VIEWPORTS = [
  {
    id: 'iphone-se-2-3',
    label: 'iPhone SE 2/3',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    devices: ['iPhone SE 2', 'iPhone SE 3'],
  },
  {
    id: 'iphone-13-14',
    label: 'iPhone 13/14',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    devices: ['iPhone 13', 'iPhone 13 Pro', 'iPhone 14'],
  },
] as const satisfies readonly MobileProfileViewport[];

type ReleaseCardLayout = {
  readonly pac: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  };
  readonly pacBox: {
    readonly width: number;
    readonly height: number;
  };
  readonly pacIsFeatured: boolean;
  readonly carouselPresent: boolean;
  readonly rail: {
    readonly left: number;
    readonly right: number;
  };
  readonly pacCopyFits: boolean;
  readonly tabBar: {
    readonly top: number;
  } | null;
  readonly hero: {
    readonly top: number;
    readonly bottom: number;
  } | null;
  readonly portrait: {
    readonly width: number;
    readonly height: number;
  } | null;
};

async function collectMockHomeReleaseCardLayout(
  page: Page
): Promise<ReleaseCardLayout> {
  return page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>(
      '[data-testid="profile-home-rail"]'
    );
    const carousel = document.querySelector<HTMLElement>(
      '[data-testid="profile-home-carousel"]'
    );
    const pac = document.querySelector<HTMLElement>(
      '[data-testid="profile-pac"]'
    );
    const hero = document.querySelector<HTMLElement>(
      '[data-testid="profile-identity-header"]'
    );
    const portrait = document.querySelector<HTMLElement>(
      '[data-testid="profile-identity-portrait"]'
    );
    const tabBar = document.querySelector<HTMLElement>(
      '[data-testid="profile-tab-bar"]'
    );

    if (!rail || !pac) {
      throw new Error('Mock-home featured release (PAC) card target missing');
    }

    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
      };
    };

    const railRect = rail.getBoundingClientRect();
    const modeCard = pac.querySelector<HTMLElement>('.profile-mode-card');

    return {
      pac: rect(pac),
      pacBox: { width: pac.offsetWidth, height: pac.offsetHeight },
      // JOV-7123: the editorial card IS the home surface — featured, inside
      // the rail, with no carousel stacked underneath it.
      pacIsFeatured:
        pac.dataset.presentation === 'featured' && rail.contains(pac),
      carouselPresent: carousel !== null,
      rail: {
        left: railRect.left,
        right: railRect.right,
      },
      pacCopyFits: modeCard
        ? modeCard.scrollHeight <= modeCard.clientHeight + 1
        : false,
      tabBar: tabBar ? { top: tabBar.getBoundingClientRect().top } : null,
      hero: hero ? rect(hero) : null,
      portrait: portrait
        ? {
            width: portrait.getBoundingClientRect().width,
            height: portrait.getBoundingClientRect().height,
          }
        : null,
    };
  });
}

test.describe('Public Profile Mock Home Release Card Layout @smoke @critical', () => {
  for (const viewport of MOCK_HOME_RELEASE_CARD_VIEWPORTS) {
    test(`${viewport.label} renders a stable featured release card`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await installProfileMocks(page);

      await smokeNavigate(
        page,
        '/demo/showcase/tim-white-profile?state=mock-home',
        { timeout: 120_000 }
      );
      await waitForHydration(page);
      // Cold Turbopack route compile in the merge-queue lane can exceed the
      // default VISIBILITY (20s) wait; give first-paint readiness the same
      // budget as navigation so a slow cold compile reads as slow, not failed.
      await waitForAnyVisible(
        page,
        ['[data-testid="profile-pac"]'],
        SMOKE_TIMEOUTS.NAVIGATION
      );
      await settleLayout(page);
      await expectNoDocumentOverflow(
        page,
        testInfo,
        `${viewport.label} mock-home profile`
      );

      const snapshot = await collectViewportSnapshot(
        page,
        '[data-testid="profile-compact-surface"]'
      );
      expect(
        snapshot.horizontalOverflow,
        `${viewport.label} mock-home profile should not overflow horizontally`
      ).toBeLessThanOrEqual(2);

      const layout = await collectMockHomeReleaseCardLayout(page);

      // Pen parity (JOV-7123): the featured editorial card is the only card
      // surface under the identity header — it replaces the carousel in place.
      expect(
        layout.pacIsFeatured,
        `${viewport.label} featured release card should be the home surface`
      ).toBe(true);
      expect(
        layout.carouselPresent,
        `${viewport.label} home must not stack a highlights carousel`
      ).toBe(false);
      expect(
        Math.abs(layout.pacBox.width - (layout.rail.right - layout.rail.left)),
        `${viewport.label} featured card should span the content width`
      ).toBeLessThanOrEqual(2 * 32 + 2);
      expect(
        layout.pacCopyFits,
        `${viewport.label} featured card copy should not clip behind its action`
      ).toBe(true);

      if (layout.hero) {
        expect(
          layout.pac.top,
          `${viewport.label} featured card should sit below the identity header`
        ).toBeGreaterThanOrEqual(layout.hero.bottom - 1);
      }

      // Fully visible above the bottom tab bar inside the profile shell — no
      // clipping, no scrolling needed for the primary content. (The demo
      // phone frame itself can extend past the browser viewport — that is
      // the showcase page's own presentation, so containment is asserted
      // against the shell and tab bar, not the window.)
      const shell = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid="profile-compact-surface"]'
        );
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      if (shell) {
        expect(
          layout.pac.bottom,
          `${viewport.label} featured card should stay inside the profile shell`
        ).toBeLessThanOrEqual(shell.bottom + 1);
        expect(
          layout.pac.top,
          `${viewport.label} featured card should stay inside the profile shell`
        ).toBeGreaterThanOrEqual(shell.top - 1);
      }
      if (layout.tabBar) {
        expect(
          layout.pac.bottom,
          `${viewport.label} featured card should clear the bottom tab bar`
        ).toBeLessThanOrEqual(layout.tabBar.top + 1);
      }

      // Stability: the card's bounding box must not move once rendered.
      await settleLayout(page);
      const settled = await collectMockHomeReleaseCardLayout(page);
      expect(
        Math.abs(settled.pac.top - layout.pac.top),
        `${viewport.label} featured card should not shift vertically`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(settled.pac.height - layout.pac.height),
        `${viewport.label} featured card should not change height`
      ).toBeLessThanOrEqual(1);

      // The identity portrait holds its 80px circle on every viewport.
      expect(
        layout.portrait,
        `${viewport.label} portrait is required`
      ).not.toBeNull();
      expect(
        Math.abs((layout.portrait?.width ?? 0) - 80),
        `${viewport.label} portrait should be 80px`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((layout.portrait?.height ?? 0) - 80),
        `${viewport.label} portrait should be 80px`
      ).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('Public Profile Home Editorial Card @smoke @critical', () => {
  test('public surface renders one featured card — no carousel — across the strict viewport matrix', async ({
    page,
  }) => {
    const viewports = [
      { label: 'compact 320', width: 320, height: 568 },
      { label: 'iPhone mini', width: 375, height: 812 },
      { label: 'iPhone', width: 390, height: 844 },
      { label: 'iPhone max', width: 430, height: 932 },
      { label: 'tablet', width: 768, height: 1024 },
      { label: 'desktop', width: 1440, height: 1000 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await smokeNavigate(page, '/demo/showcase/public-profile', {
        timeout: 120_000,
      });
      await waitForHydration(page);
      await waitForAnyVisible(
        page,
        ['[data-testid="profile-pac"]'],
        SMOKE_TIMEOUTS.NAVIGATION
      );
      await settleLayout(page);

      // JOV-7123: the editorial card replaces the highlights carousel — the
      // home surface must not mount a second card track at all.
      const geometry = await page.evaluate(() => {
        const pac = document.querySelector<HTMLElement>(
          '[data-testid="profile-pac"]'
        );
        const rail = document.querySelector<HTMLElement>(
          '[data-testid="profile-home-rail"]'
        );
        const modeCard = pac?.querySelector<HTMLElement>('.profile-mode-card');
        const portrait = document.querySelector<HTMLElement>(
          '[data-testid="profile-identity-portrait"]'
        );
        const portraitImage = portrait?.querySelector<HTMLElement>('img');
        const portraitRect = portrait?.getBoundingClientRect();
        const imageRect = portraitImage?.getBoundingClientRect();
        const dockHost = document.querySelector<HTMLElement>(
          '[data-testid="profile-tab-bar"]'
        );
        const glassDock = dockHost?.querySelector<HTMLElement>('nav');
        const glassStyle = glassDock ? getComputedStyle(glassDock) : null;
        const pacRect = pac?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const targetsOf = (root: Element | null | undefined) =>
          root
            ? [...root.querySelectorAll<HTMLElement>('a, button')].map(
                target => {
                  const targetRect = target.getBoundingClientRect();
                  return {
                    width: targetRect.width,
                    height: targetRect.height,
                  };
                }
              )
            : [];
        return {
          carouselCount: document.querySelectorAll(
            '[data-testid="profile-home-carousel"]'
          ).length,
          pac: pac
            ? {
                featured: pac.dataset.presentation === 'featured',
                insideRail: Boolean(rail?.contains(pac)),
                width: pac.offsetWidth,
                railWidth: railRect ? railRect.right - railRect.left : null,
                aboveDock: Boolean(
                  pacRect &&
                    dockHost &&
                    (() => {
                      const dockRect = dockHost.getBoundingClientRect();
                      // Compact tab chrome is CSS-hidden at >=1180px
                      // (JOV-5995); only a visible dock constrains the card.
                      if (dockRect.height === 0) return true;
                      return pacRect.bottom <= dockRect.top + 1;
                    })()
                ),
                targets: targetsOf(pac),
              }
            : null,
          pacCopyFits: modeCard
            ? modeCard.scrollHeight <= modeCard.clientHeight + 1
            : false,
          portraitFilled: Boolean(
            portraitRect &&
              imageRect &&
              imageRect.left <= portraitRect.left + 1 &&
              imageRect.right >= portraitRect.right - 1 &&
              imageRect.top <= portraitRect.top + 1 &&
              imageRect.bottom >= portraitRect.bottom - 1 &&
              portraitImage &&
              getComputedStyle(portraitImage).objectFit === 'cover'
          ),
          glassDock: glassStyle
            ? {
                backdropFilter: glassStyle.backdropFilter,
                backgroundColor: glassStyle.backgroundColor,
                borderColor: glassStyle.borderColor,
              }
            : null,
        };
      });

      expect(
        geometry.carouselCount,
        `${viewport.label} home must not mount a highlights carousel`
      ).toBe(0);
      expect(
        geometry.pac?.featured && geometry.pac.insideRail,
        `${viewport.label} featured editorial card is the home surface`
      ).toBe(true);
      expect(
        geometry.pac?.targets.length,
        `${viewport.label} featured card exposes an action`
      ).toBeGreaterThan(0);
      expect(
        geometry.pac?.targets.every(target => target.height >= 44),
        `${viewport.label} featured-card actions meet the 44px floor`
      ).toBe(true);
      expect(
        geometry.pac?.railWidth !== null &&
          Math.abs(
            (geometry.pac?.width ?? 0) - (geometry.pac?.railWidth ?? 0)
          ) <= 2,
        `${viewport.label} featured card spans the rail width`
      ).toBe(true);
      expect(
        geometry.pacCopyFits,
        `${viewport.label} featured card copy does not clip behind its action`
      ).toBe(true);
      expect(
        geometry.pac?.aboveDock,
        `${viewport.label} featured card clears the bottom dock`
      ).toBe(true);
      expect(
        geometry.portraitFilled,
        `${viewport.label} portrait image fills its circle`
      ).toBe(true);
      expect(
        geometry.glassDock?.backdropFilter,
        `${viewport.label} dock keeps real backdrop blur`
      ).not.toBe('none');
      expect(
        geometry.glassDock?.backgroundColor,
        `${viewport.label} dock keeps a translucent surface`
      ).not.toBe('rgba(0, 0, 0, 0)');
      expect(
        geometry.glassDock?.borderColor,
        `${viewport.label} dock keeps its hairline`
      ).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('late cookie consent measurement never reflows the profile stage or covers the dock', async ({
    page,
  }) => {
    const viewports = [
      { label: 'phone small', width: 320, height: 568 },
      { label: 'phone', width: 390, height: 844 },
      { label: 'phone max', width: 430, height: 932 },
      { label: 'compact edge', width: 767, height: 1024 },
      { label: 'tablet', width: 768, height: 1024 },
      { label: 'desktop', width: 1024, height: 1024 },
      { label: 'compact desktop edge', width: 1179, height: 1024 },
      { label: 'desktop layout edge', width: 1180, height: 1024 },
      { label: 'wide desktop', width: 1440, height: 1024 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await smokeNavigate(page, '/demo/showcase/public-profile', {
        timeout: 120_000,
      });
      await waitForHydration(page);
      await waitForAnyVisible(
        page,
        ['[data-testid="profile-pac"]'],
        SMOKE_TIMEOUTS.NAVIGATION
      );
      await settleLayout(page);

      const readGeometry = () =>
        page.evaluate(() => {
          const rect = (element: Element | null) => {
            if (!element) return null;
            const bounds = element.getBoundingClientRect();
            return {
              left: bounds.left,
              top: bounds.top,
              right: bounds.right,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height,
            };
          };

          const banner = document.querySelector<HTMLElement>(
            '[data-testid="cookie-banner"]'
          );
          const actions = document.querySelector<HTMLElement>(
            '[data-testid="cookie-actions"]'
          );

          return {
            shell: rect(document.querySelector('.profile-viewport')),
            frame: rect(document.querySelector('.public-profile-layout-frame')),
            cover: rect(
              document.querySelector('[data-testid="profile-cover"]')
            ),
            dock: rect(
              document.querySelector('[data-testid="profile-tab-bar"]')
            ),
            primaryAction: rect(
              document.querySelector(
                '[data-testid="profile-pac"] a, [data-testid="profile-pac"] button'
              )
            ),
            topChromeButtons: Array.from(
              document.querySelectorAll('.profile-cover-chrome button')
            ).map(rect),
            banner: rect(banner),
            actions: rect(actions),
            bannerScrollWidth: banner?.scrollWidth ?? null,
            bannerClientWidth: banner?.clientWidth ?? null,
            actionsScrollWidth: actions?.scrollWidth ?? null,
            actionsClientWidth: actions?.clientWidth ?? null,
            bannerActions: Array.from(
              document.querySelectorAll(
                '[data-testid="cookie-actions"] > button'
              )
            ).map(rect),
          };
        });

      const before = await readGeometry();
      await page.evaluate(() => {
        document.documentElement.style.setProperty(
          '--cookie-banner-h',
          '146px'
        );

        const banner = document.createElement('aside');
        banner.setAttribute('aria-label', 'Cookie Consent');
        banner.className =
          'cookie-banner-card fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-85 cookie-banner-card--above-public-profile-dock';
        banner.dataset.testid = 'cookie-banner';

        const surface = document.createElement('div');
        surface.className =
          'rounded-2xl border border-(--app-shell-frame-seam) bg-surface-1 px-4 py-3 shadow-card';
        const content = document.createElement('div');
        content.className = 'min-w-0';
        const copy = document.createElement('p');
        copy.className = 'text-xs leading-snug text-secondary-token';
        copy.append(
          'Essential cookies keep Jovie working. Choose whether to allow analytics and marketing cookies. '
        );
        const privacy = document.createElement('a');
        privacy.href = '/legal/privacy';
        privacy.className =
          'underline hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent';
        privacy.textContent = 'Privacy';
        copy.append(privacy);

        const actionsMargin = document.createElement('div');
        actionsMargin.className = 'mt-3';
        const actions = document.createElement('div');
        actions.className =
          'cookie-actions--compact flex shrink-0 flex-row flex-wrap items-center';
        actions.dataset.testid = 'cookie-actions';
        actions.style.gap = '4px';

        const addAction = (
          label: string,
          testId: string,
          variant: 'choice' | 'customize'
        ) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `min-w-0 flex-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent sm:flex-none cookie-action--${variant}`;
          button.dataset.testid = testId;
          button.textContent = label;
          Object.assign(button.style, {
            backgroundColor:
              variant === 'choice'
                ? 'var(--linear-btn-primary-bg)'
                : 'var(--linear-bg-button)',
            color:
              variant === 'choice'
                ? 'var(--linear-btn-primary-fg)'
                : 'var(--linear-text-primary)',
            border:
              variant === 'choice'
                ? '1px solid var(--linear-btn-primary-bg)'
                : '1px solid var(--linear-border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 'var(--linear-font-weight-medium)',
            padding: variant === 'choice' ? '6px 8px' : '6px',
            whiteSpace: 'nowrap',
            height: '44px',
          });
          actions.append(button);
        };

        addAction('Reject all', 'cookie-action-reject-all', 'choice');
        addAction('Accept all', 'cookie-action-accept-all', 'choice');
        addAction('Customize', 'cookie-action-customize', 'customize');
        actionsMargin.append(actions);
        content.append(copy, actionsMargin);
        surface.append(content);
        banner.append(surface);
        document.body.append(banner);
      });
      await page.evaluate(
        () =>
          new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      );

      const after = await readGeometry();
      expect(
        after.shell,
        `${viewport.label} shell must ignore delayed cookie height`
      ).toEqual(before.shell);
      expect(
        after.frame,
        `${viewport.label} frame must ignore delayed cookie height`
      ).toEqual(before.frame);
      expect(
        after.cover,
        `${viewport.label} hero must ignore delayed cookie height`
      ).toEqual(before.cover);
      expect(
        after.dock,
        `${viewport.label} dock must ignore delayed cookie height`
      ).toEqual(before.dock);

      expect(
        after.topChromeButtons.length,
        `${viewport.label} profile should expose top-chrome buttons`
      ).toBeGreaterThan(0);
      for (const [index, topChromeButton] of after.topChromeButtons.entries()) {
        if (!after.banner || !topChromeButton) {
          throw new Error(
            `${viewport.label} top-chrome overlap prerequisites disappeared`
          );
        }
        const overlapsTopChromeHorizontally =
          after.banner.left < topChromeButton.right &&
          after.banner.right > topChromeButton.left;
        const overlapsTopChromeVertically =
          after.banner.top < topChromeButton.bottom &&
          after.banner.bottom > topChromeButton.top;
        expect(
          overlapsTopChromeHorizontally && overlapsTopChromeVertically,
          `${viewport.label} consent card must not cover top-chrome button ${index + 1}`
        ).toBe(false);
      }

      if (viewport.width < 768) {
        expect(after.banner, 'phone consent card should render').not.toBeNull();
        expect(after.dock, 'phone dock should render').not.toBeNull();
        expect(
          after.banner?.bottom ?? Number.POSITIVE_INFINITY,
          'phone consent card should clear the glass dock'
        ).toBeLessThanOrEqual((after.dock?.top ?? 0) - 8);
      }

      if (after.banner && after.dock) {
        const overlapsHorizontally =
          after.banner.left < after.dock.right &&
          after.banner.right > after.dock.left;
        const overlapsVertically =
          after.banner.top < after.dock.bottom &&
          after.banner.bottom > after.dock.top;
        expect(
          overlapsHorizontally && overlapsVertically,
          `${viewport.label} consent card must not cover the glass dock`
        ).toBe(false);
      }

      expect(
        after.banner,
        `${viewport.label} consent card must render for overlap verification`
      ).not.toBeNull();
      expect(
        after.primaryAction,
        `${viewport.label} primary profile action must render for overlap verification`
      ).not.toBeNull();
      const banner = after.banner;
      const primaryAction = after.primaryAction;
      if (!banner || !primaryAction) {
        throw new Error(
          `${viewport.label} overlap prerequisites disappeared after assertion`
        );
      }
      expect(
        banner.height,
        `${viewport.label} measured banner height`
      ).toBeGreaterThan(0);
      expect(
        banner.left,
        `${viewport.label} banner left in viewport`
      ).toBeGreaterThanOrEqual(0);
      expect(
        banner.top,
        `${viewport.label} banner top in viewport`
      ).toBeGreaterThanOrEqual(0);
      expect(
        banner.right,
        `${viewport.label} banner right in viewport`
      ).toBeLessThanOrEqual(viewport.width);
      expect(
        banner.bottom,
        `${viewport.label} banner bottom in viewport`
      ).toBeLessThanOrEqual(viewport.height);
      expect(
        after.bannerScrollWidth,
        `${viewport.label} banner content must not overflow horizontally`
      ).toBeLessThanOrEqual(after.bannerClientWidth ?? -1);
      expect(
        after.actionsScrollWidth,
        `${viewport.label} action row must not overflow horizontally`
      ).toBeLessThanOrEqual(after.actionsClientWidth ?? -1);

      expect(after.bannerActions).toHaveLength(3);
      for (const [index, action] of after.bannerActions.entries()) {
        if (!action) {
          throw new Error(
            `${viewport.label} cookie action ${index + 1} disappeared`
          );
        }
        expect(
          action.height,
          `${viewport.label} action ${index + 1} touch floor`
        ).toBeGreaterThanOrEqual(44);
        expect(
          action.left,
          `${viewport.label} action ${index + 1} inside banner`
        ).toBeGreaterThanOrEqual(banner.left);
        expect(
          action.right,
          `${viewport.label} action ${index + 1} inside banner`
        ).toBeLessThanOrEqual(banner.right);
        expect(
          action.top,
          `${viewport.label} action ${index + 1} inside banner`
        ).toBeGreaterThanOrEqual(banner.top);
        expect(
          action.bottom,
          `${viewport.label} action ${index + 1} inside banner`
        ).toBeLessThanOrEqual(banner.bottom);
      }
      for (let first = 0; first < after.bannerActions.length; first += 1) {
        for (
          let second = first + 1;
          second < after.bannerActions.length;
          second += 1
        ) {
          const a = after.bannerActions[first];
          const b = after.bannerActions[second];
          if (!a || !b) continue;
          const intersect =
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;
          expect(
            intersect,
            `${viewport.label} cookie actions ${first + 1} and ${second + 1} must not intersect`
          ).toBe(false);
        }
      }
      if (viewport.width <= 383) {
        const [reject, accept, customize] = after.bannerActions;
        if (!reject || !accept || !customize || !after.actions) {
          throw new Error(
            `${viewport.label} narrow consent layout prerequisites disappeared`
          );
        }
        expect(
          reject.top,
          `${viewport.label} choices share the first row`
        ).toBe(accept.top);
        expect(
          customize.top,
          `${viewport.label} Customize occupies the second row`
        ).toBeGreaterThanOrEqual(reject.bottom + 4);
        expect(
          customize.left,
          `${viewport.label} Customize spans the action row`
        ).toBe(after.actions.left);
        expect(
          customize.right,
          `${viewport.label} Customize spans the action row`
        ).toBe(after.actions.right);
      }
      const overlapsHorizontally =
        banner.left < primaryAction.right && banner.right > primaryAction.left;
      const overlapsVertically =
        banner.top < primaryAction.bottom && banner.bottom > primaryAction.top;
      expect(
        overlapsHorizontally && overlapsVertically,
        `${viewport.label} consent card must not cover the primary profile action`
      ).toBe(false);

      await page.evaluate(() => {
        document.documentElement.style.removeProperty('--cookie-banner-h');
        document.querySelector('[data-testid="cookie-banner"]')?.remove();
      });
    }
  });

  test('mock-home renders one featured card and no back-catalog track', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installProfileMocks(page);

    await smokeNavigate(
      page,
      '/demo/showcase/tim-white-profile?state=mock-home',
      { timeout: 120_000 }
    );
    await waitForHydration(page);
    // JOV-7123: the editorial card replaces the carousel — the back catalog
    // lives on the Music destination, not a second track on Home.
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-pac"] a'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const pac = page.getByTestId('profile-pac');
    await expect(pac).toBeVisible();
    await expect(page.getByTestId('profile-home-carousel')).toHaveCount(0);
    const metrics = await pac.evaluate(el => ({
      linkCount: el.querySelectorAll('a').length,
      featured: el.dataset.presentation === 'featured',
    }));
    expect(metrics.featured).toBe(true);
    expect(metrics.linkCount).toBeGreaterThanOrEqual(1);
  });

  // JOV-5845 / JOV-7123: the keyboard smoke point now lives on the featured
  // editorial card (the carousel it traversed is gone). Tab must land inside
  // the card with a visible, hittable focus ring, then reach profile nav.
  test('keyboard focus reaches the editorial card and activates profile navigation', async ({
    browserName,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await smokeNavigate(page, '/demo/showcase/public-profile', {
      timeout: 120_000,
    });
    await waitForHydration(page);
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-pac"]'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    await expect(page.getByTestId('profile-home-carousel')).toHaveCount(0);

    // WebKit models Safari's default macOS keyboard policy: Option+Tab moves
    // through every control, while plain Tab may leave focus on the document.
    const focusNextKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    let focusedCard = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await page.keyboard.press(focusNextKey);
      focusedCard = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-testid="profile-pac"]'))
      );
      if (focusedCard) break;
    }
    expect(focusedCard).toBe(true);

    const cardFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const rect = active?.getBoundingClientRect();
      return {
        label:
          active?.getAttribute('aria-label') ?? active?.textContent?.trim(),
        height: rect?.height ?? 0,
        focusVisible: active?.matches(':focus-visible') ?? false,
      };
    });
    expect(cardFocus.label).toBe('Listen');
    expect(cardFocus.height).toBeGreaterThanOrEqual(44);
    expect(cardFocus.focusVisible).toBe(true);

    let focusedEvents = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.keyboard.press(focusNextKey);
      focusedEvents = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'Events'
      );
      if (focusedEvents) break;
    }
    expect(focusedEvents).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/calvin-demo\?mode=tour$/);
    await expect(
      page.getByRole('heading', { name: 'Events', exact: true })
    ).toBeVisible();
  });
});

test.describe('Public Profile Mobile Viewport Stability @smoke @critical', () => {
  test.setTimeout(120_000);

  for (const viewport of MOBILE_PROFILE_VIEWPORTS) {
    for (const screen of PROFILE_MOBILE_SCREENS) {
      test(`${viewport.label} ${screen.id} fills the mobile viewport`, async ({
        context,
      }, testInfo) => {
        const screenPage = await context.newPage();

        try {
          await screenPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await installProfileMocks(screenPage);
          await installNotificationFlowMocks(screenPage);
          await warmProfileRouteForBudget(screenPage, screen.path);

          const response = await smokeNavigate(screenPage, screen.path, {
            timeout: 120_000,
          });
          expect(response?.status() ?? 0).toBeLessThan(500);

          await waitForHydration(screenPage);
          await waitForAnyVisible(
            screenPage,
            screen.readySelectors,
            SMOKE_TIMEOUTS.NAVIGATION
          );
          await settleLayout(screenPage);

          const snapshot = await collectViewportSnapshot(
            screenPage,
            screen.rootSelector
          );
          expectMobileShellStable(
            snapshot,
            viewport,
            `${viewport.label} ${screen.id}`
          );
          await expectNavigationBudget(
            screenPage,
            getNavigationBudget(screen.id),
            `${viewport.label} ${screen.id}`
          );
          await maybeCaptureScreenshot(
            screenPage,
            viewport,
            screen.id,
            testInfo
          );
        } finally {
          await screenPage.close();
        }
      });
    }

    test(`${viewport.label} alerts walkthrough focus never shifts the shell`, async ({
      context,
    }) => {
      const flowPage = await context.newPage();

      try {
        await flowPage.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await installProfileMocks(flowPage);
        await installNotificationFlowMocks(flowPage);

        const response = await smokeNavigate(
          flowPage,
          '/testartist?mode=subscribe',
          {
            timeout: 120_000,
          }
        );
        expect(response?.status() ?? 0).toBeLessThan(500);
        await waitForHydration(flowPage);
        await waitForAnyVisible(
          flowPage,
          ['[data-testid="profile-mobile-notifications-step-email"]'],
          SMOKE_TIMEOUTS.NAVIGATION
        );

        const rootSelector = '[data-testid="profile-compact-surface"]';
        const activeFlow = flowPage
          .locator('[data-testid="profile-mobile-notifications-flow"]:visible')
          .first();
        const emailInput = activeFlow.getByTestId('mobile-email-input');
        await focusAndAssertNoShift(
          flowPage,
          emailInput,
          rootSelector,
          `${viewport.label} email`
        );
        await emailInput.fill(`mobile-${viewport.id}@example.com`);
        await activeFlow
          .getByTestId('profile-mobile-notifications-step-email')
          .getByRole('button', { name: /^submit$/i })
          .click();

        const firstOtpDigit = activeFlow.getByLabel('Digit 1 of 6');
        await focusAndAssertNoShift(
          flowPage,
          firstOtpDigit,
          rootSelector,
          `${viewport.label} otp`
        );
        await firstOtpDigit.pressSequentially('123456');

        const nameInput = activeFlow.getByTestId('mobile-name-input');
        await focusAndAssertNoShift(
          flowPage,
          nameInput,
          rootSelector,
          `${viewport.label} name`
        );
        await nameInput.fill('Alex');
        await activeFlow
          .getByTestId('profile-mobile-notifications-step-name')
          .getByRole('button', { name: /^continue$/i })
          .click();

        // Birthday uses segmented digit groups (GH-13389); focus the first
        // numeric input inside each group rather than a select trigger.
        for (const [id, label] of [
          ['mobile-birthday-month', 'birthday month'],
          ['mobile-birthday-day', 'birthday day'],
          ['mobile-birthday-year', 'birthday year'],
        ] as const) {
          await focusAndAssertNoShift(
            flowPage,
            activeFlow.getByTestId(id).locator('input').first(),
            rootSelector,
            `${viewport.label} ${label}`
          );
        }
      } finally {
        await flowPage.close();
      }
    });
  }
});
