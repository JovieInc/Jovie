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
  readonly pacIsFeaturedAboveCarousel: boolean;
  readonly firstCarouselCardIsIntact: boolean;
  readonly peerCard: {
    readonly width: number;
    readonly height: number;
    readonly left: number;
  } | null;
  readonly rail: {
    readonly left: number;
    readonly right: number;
    readonly scrollSnapType: string;
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

    if (!carousel || !pac) {
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

    const firstLi = carousel.querySelector(':scope > li');
    // The second carousel card must rest fully outside the track.
    const peerLi = [...carousel.querySelectorAll(':scope > li')].at(1) as
      | HTMLElement
      | undefined;

    const railRect = carousel.getBoundingClientRect();
    const modeCard = pac.querySelector<HTMLElement>('.profile-mode-card');

    return {
      pac: rect(pac),
      pacBox: { width: pac.offsetWidth, height: pac.offsetHeight },
      pacIsFeaturedAboveCarousel:
        pac.dataset.presentation === 'featured' &&
        !carousel.contains(pac) &&
        Boolean(
          pac.compareDocumentPosition(carousel) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ),
      firstCarouselCardIsIntact: firstLi
        ? firstLi.getBoundingClientRect().right <= railRect.right + 1
        : true,
      peerCard: peerLi
        ? {
            width: peerLi.offsetWidth,
            height: peerLi.offsetHeight,
            left: peerLi.getBoundingClientRect().left,
          }
        : null,
      rail: {
        left: railRect.left,
        right: railRect.right,
        scrollSnapType: getComputedStyle(carousel).scrollSnapType,
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

      // Pen parity: the featured release card (PAC) is the Listen mode card
      // under the identity header; the rest of the highlights follow in the
      // carousel below it.
      expect(
        layout.pacIsFeaturedAboveCarousel,
        `${viewport.label} featured release card should lead above the carousel`
      ).toBe(true);
      expect(
        Math.abs(layout.pacBox.width - (layout.rail.right - layout.rail.left)),
        `${viewport.label} featured card should span the content width`
      ).toBeLessThanOrEqual(2 * 32 + 2);
      expect(layout.rail.scrollSnapType).toBe('x mandatory');
      expect(
        layout.firstCarouselCardIsIntact,
        `${viewport.label} first carousel card should rest inside the track`
      ).toBe(true);
      expect(
        layout.pacCopyFits,
        `${viewport.label} featured card copy should not clip behind its action`
      ).toBe(true);
      if (layout.peerCard) {
        expect(
          layout.peerCard.left,
          `${viewport.label} should show exactly one carousel card at rest`
        ).toBeGreaterThanOrEqual(layout.rail.right - 1);
      }

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

test.describe('Public Profile Home Carousel @smoke @critical', () => {
  test('public surface isolates intact first/last cards across the strict viewport matrix', async ({
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

      const carousel = page.getByTestId('profile-home-carousel');
      const readGeometry = () =>
        carousel.evaluate(el => {
          const rail = el.getBoundingClientRect();
          const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
          const pac = document.querySelector<HTMLElement>(
            '[data-testid="profile-pac"]'
          );
          const modeCard =
            pac?.querySelector<HTMLElement>('.profile-mode-card');
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
            scrollLeft: el.scrollLeft,
            rail: { left: rail.left, right: rail.right },
            snap: getComputedStyle(el).scrollSnapType,
            pac: pac
              ? {
                  featured: pac.dataset.presentation === 'featured',
                  outsideCarousel: !el.contains(pac),
                  targets: targetsOf(pac),
                }
              : null,
            cards: cards.map(card => {
              const rect = card.getBoundingClientRect();
              return {
                left: rect.left,
                right: rect.right,
                width: card.offsetWidth,
                height: card.offsetHeight,
                targets: targetsOf(card),
              };
            }),
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

      const first = await readGeometry();
      expect(first.snap, `${viewport.label} uses mandatory x snapping`).toBe(
        'x mandatory'
      );
      expect(
        first.pac?.featured && first.pac.outsideCarousel,
        `${viewport.label} PAC leads as the featured mode card`
      ).toBe(true);
      expect(
        first.pac?.targets.length,
        `${viewport.label} featured card exposes an action`
      ).toBeGreaterThan(0);
      expect(
        first.pac?.targets.every(target => target.height >= 44),
        `${viewport.label} featured-card actions meet the 44px floor`
      ).toBe(true);
      expect(
        first.pacCopyFits,
        `${viewport.label} PAC copy does not clip behind its action`
      ).toBe(true);
      expect(
        first.cards.length,
        `${viewport.label} keeps the highlights carousel`
      ).toBeGreaterThan(0);
      expect(
        first.cards[0]?.left,
        `${viewport.label} first left`
      ).toBeGreaterThanOrEqual(first.rail.left);
      expect(
        first.cards[0]?.right,
        `${viewport.label} first right`
      ).toBeLessThanOrEqual(first.rail.right);
      if (first.cards[1]) {
        expect(
          first.cards[1].left,
          `${viewport.label} next card hidden`
        ).toBeGreaterThanOrEqual(first.rail.right - 1);
      }
      expect(
        Math.abs(
          (first.cards[0]?.width ?? 0) / (first.cards[0]?.height ?? 1) - 2.25
        ),
        `${viewport.label} keeps the 9:4 card geometry`
      ).toBeLessThanOrEqual(0.02);
      expect(
        first.cards[0]?.targets.every(target => target.height >= 44),
        `${viewport.label} first-card actions meet the 44px floor`
      ).toBe(true);
      expect(
        first.portraitFilled,
        `${viewport.label} portrait image fills its circle`
      ).toBe(true);
      expect(
        first.glassDock?.backdropFilter,
        `${viewport.label} dock keeps real backdrop blur`
      ).not.toBe('none');
      expect(
        first.glassDock?.backgroundColor,
        `${viewport.label} dock keeps a translucent surface`
      ).not.toBe('rgba(0, 0, 0, 0)');
      expect(
        first.glassDock?.borderColor,
        `${viewport.label} dock keeps its hairline`
      ).not.toBe('rgba(0, 0, 0, 0)');

      if (first.cards.length > 1) {
        const targetScrollLeft = await carousel.evaluate(el => {
          const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
          const requestedTarget =
            (cards.at(-1)?.offsetLeft ?? 0) - (cards[0]?.offsetLeft ?? 0);
          const target = Math.min(
            requestedTarget,
            el.scrollWidth - el.clientWidth
          );
          el.scrollTo({ left: target, behavior: 'auto' });
          return target;
        });
        await expect
          .poll(async () =>
            Math.abs(
              (await carousel.evaluate(el => el.scrollLeft)) - targetScrollLeft
            )
          )
          .toBeLessThanOrEqual(1);

        const last = await readGeometry();
        const lastCard = last.cards.at(-1);
        expect(
          last.cards[0]?.right,
          `${viewport.label} previous card hidden`
        ).toBeLessThanOrEqual(last.rail.left + 1);
        expect(
          lastCard?.left,
          `${viewport.label} last left`
        ).toBeGreaterThanOrEqual(last.rail.left);
        expect(
          lastCard?.right,
          `${viewport.label} last right`
        ).toBeLessThanOrEqual(last.rail.right + 1);
        expect(
          lastCard?.targets.every(target => target.height >= 44),
          `${viewport.label} last-card actions meet the 44px floor`
        ).toBe(true);
      }
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

  test('mock-home includes horizontally scrollable back-catalog cards', async ({
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
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-home-carousel"] a'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const carousel = page.getByTestId('profile-home-carousel');
    await expect(carousel).toBeVisible();
    const metrics = await carousel.evaluate(el => ({
      linkCount: el.querySelectorAll('a').length,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(metrics.linkCount).toBeGreaterThanOrEqual(2);
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    await expect(
      carousel.locator('a').filter({ hasText: /Holding On/i })
    ).toHaveCount(1);
    await expect(
      carousel.locator('a').filter({ hasText: /Clear Skies/i })
    ).toHaveCount(1);

    const scrolledLeft = await carousel.evaluate(el => {
      el.scrollLeft = el.scrollWidth;
      return el.scrollLeft;
    });
    expect(scrolledLeft).toBeGreaterThan(0);
  });

  test('every settled landscape snap isolates one complete card', async ({
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
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-home-carousel"]'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const carousel = page.getByTestId('profile-home-carousel');
    const targetScrollLeft = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      if (cards.length < 3) throw new Error('Expected at least three cards');
      const target = cards[1].offsetLeft - cards[0].offsetLeft;
      el.scrollTo({ left: target, behavior: 'auto' });
      return target;
    });
    await expect
      .poll(() => carousel.evaluate(el => el.scrollLeft))
      .toBeCloseTo(targetScrollLeft, 0);

    const isolation = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      const rail = el.getBoundingClientRect();
      const previous = cards[0].getBoundingClientRect();
      const active = cards[1].getBoundingClientRect();
      const next = cards[2].getBoundingClientRect();
      return {
        previousRight: previous.right,
        activeLeft: active.left,
        activeRight: active.right,
        nextLeft: next.left,
        railLeft: rail.left,
        railRight: rail.right,
      };
    });

    expect(isolation.previousRight).toBeLessThanOrEqual(isolation.railLeft + 1);
    expect(isolation.activeLeft).toBeGreaterThanOrEqual(isolation.railLeft);
    expect(isolation.activeRight).toBeLessThanOrEqual(isolation.railRight);
    expect(isolation.nextLeft).toBeGreaterThanOrEqual(isolation.railRight - 1);
  });

  test('reduced motion keeps card geometry fixed and uses immediate navigation', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await installProfileMocks(page);
    await smokeNavigate(
      page,
      '/demo/showcase/tim-white-profile?state=mock-home',
      { timeout: 120_000 }
    );
    await waitForHydration(page);
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-home-carousel"]'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const carousel = page.getByTestId('profile-home-carousel');
    const before = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      const scrollBehaviors: ScrollBehavior[] = [];
      const nativeScrollTo = el.scrollTo.bind(el);
      el.scrollTo = options => {
        if (typeof options === 'object' && options.behavior) {
          scrollBehaviors.push(options.behavior);
        }
        nativeScrollTo(options);
      };
      (
        window as Window & {
          __profileScrollBehaviors?: ScrollBehavior[];
        }
      ).__profileScrollBehaviors = scrollBehaviors;
      return {
        sizes: cards.map(card => [card.offsetWidth, card.offsetHeight]),
        hasDimmedEdgeState: cards.some(card => card.dataset.edge === 'true'),
        opacities: cards.map(card => getComputedStyle(card).opacity),
      };
    });

    const clickedNext = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Next Card"]'
      );
      button?.click();
      return Boolean(button);
    });
    expect(clickedNext).toBe(true);
    await expect
      .poll(() => carousel.evaluate(el => el.scrollLeft))
      .toBeGreaterThan(0);

    const after = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      return {
        sizes: cards.map(card => [card.offsetWidth, card.offsetHeight]),
        hasDimmedEdgeState: cards.some(card => card.dataset.edge === 'true'),
        opacities: cards.map(card => getComputedStyle(card).opacity),
        behaviors:
          (
            window as Window & {
              __profileScrollBehaviors?: ScrollBehavior[];
            }
          ).__profileScrollBehaviors ?? [],
      };
    });

    expect(before.hasDimmedEdgeState).toBe(false);
    expect(after.hasDimmedEdgeState).toBe(false);
    expect(before.opacities.every(opacity => opacity === '1')).toBe(true);
    expect(after.opacities.every(opacity => opacity === '1')).toBe(true);
    expect(after.behaviors).toContain('auto');
    expect(after.sizes).toEqual(before.sizes);
  });

  test('a Chromium touch drag advances exactly one complete card', async ({
    browserName,
    context,
    page,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input is Chromium-only');
    await page.setViewportSize({ width: 390, height: 844 });
    await smokeNavigate(page, '/demo/showcase/public-profile', {
      timeout: 120_000,
    });
    await waitForHydration(page);
    await waitForAnyVisible(
      page,
      ['[data-testid="profile-home-carousel"]'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const carousel = page.getByTestId('profile-home-carousel');
    const box = await carousel.boundingBox();
    if (!box) throw new Error('Carousel touch target is not visible');
    const targetScrollLeft = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      return (cards[1]?.offsetLeft ?? 0) - (cards[0]?.offsetLeft ?? 0);
    });
    const cdp = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 28;
    const endX = box.x + 28;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y, id: 1 }],
    });
    for (let step = 1; step <= 6; step += 1) {
      const x = startX + ((endX - startX) * step) / 6;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await expect
      .poll(() => carousel.evaluate(el => el.scrollLeft))
      .toBeCloseTo(targetScrollLeft, 0);
    const settled = await carousel.evaluate(el => {
      const rail = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      const previous = cards[0]?.getBoundingClientRect();
      const active = cards[1]?.getBoundingClientRect();
      return {
        railLeft: rail.left,
        railRight: rail.right,
        previousRight: previous?.right ?? Number.POSITIVE_INFINITY,
        activeLeft: active?.left ?? Number.NEGATIVE_INFINITY,
        activeRight: active?.right ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(settled.previousRight).toBeLessThanOrEqual(settled.railLeft + 1);
    expect(settled.activeLeft).toBeGreaterThanOrEqual(settled.railLeft);
    expect(settled.activeRight).toBeLessThanOrEqual(settled.railRight);
  });

  test('keyboard focus traverses complete cards and activates profile navigation', async ({
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
      ['[data-testid="profile-home-carousel"]'],
      SMOKE_TIMEOUTS.NAVIGATION
    );

    const carousel = page.getByTestId('profile-home-carousel');
    // WebKit models Safari's default macOS keyboard policy: Option+Tab moves
    // through every control, while plain Tab may leave focus on the document.
    const focusNextKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    let focusedFirstCard = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await page.keyboard.press(focusNextKey);
      focusedFirstCard = await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest(
            '[data-testid="profile-home-carousel"] > li:first-child'
          )
        )
      );
      if (focusedFirstCard) break;
    }
    expect(focusedFirstCard).toBe(true);

    const firstFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const rect = active?.getBoundingClientRect();
      return {
        label:
          active?.getAttribute('aria-label') ?? active?.textContent?.trim(),
        height: rect?.height ?? 0,
        focusVisible: active?.matches(':focus-visible') ?? false,
      };
    });
    expect(firstFocus.label).toBe('Listen');
    expect(firstFocus.height).toBeGreaterThanOrEqual(44);
    expect(firstFocus.focusVisible).toBe(true);

    await page.keyboard.press(focusNextKey);
    const targetScrollLeft = await carousel.evaluate(el => {
      const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
      return (cards[1]?.offsetLeft ?? 0) - (cards[0]?.offsetLeft ?? 0);
    });
    await expect
      .poll(() => carousel.evaluate(el => el.scrollLeft))
      .toBeCloseTo(targetScrollLeft, 0);
    const secondFocus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const rect = active?.getBoundingClientRect();
      return {
        inSecondCard: Boolean(
          active?.closest(
            '[data-testid="profile-home-carousel"] > li:nth-child(2)'
          )
        ),
        height: rect?.height ?? 0,
      };
    });
    expect(secondFocus.inSecondCard).toBe(true);
    expect(secondFocus.height).toBeGreaterThanOrEqual(44);

    let focusedEvents = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
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
