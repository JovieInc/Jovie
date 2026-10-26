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
  // Firefox supports viewport/touch checks but not Playwright's isMobile
  // context option. Preserve every layout assertion in that engine.
  isMobile: async ({ browserName }, provideMobile) => {
    await provideMobile(browserName !== 'firefox');
  },
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
    // Fan capture requires an owned profile; testartist is deliberately unclaimed.
    path: `/${TEST_PROFILES.DUALIPA}?mode=subscribe`,
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
  }, testInfo) => {
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