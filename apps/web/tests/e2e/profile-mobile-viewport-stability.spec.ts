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
    readySelectors: ['[data-testid="profile-mobile-notifications-step-email"]'],
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
    if ('fonts' in document) {
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
  readonly pacIsFirstCard: boolean;
  readonly peerCard: {
    readonly width: number;
    readonly height: number;
  } | null;
  readonly tabBar: {
    readonly top: number;
  } | null;
  readonly hero: {
    readonly top: number;
    readonly bottom: number;
  } | null;
  readonly cover: {
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
      '[data-testid="profile-hero-identity-block"]'
    );
    const cover = document.querySelector<HTMLElement>(
      '[data-testid="profile-cover"]'
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
    // A peer card in the same track (entity card or alerts card) used to
    // verify the PAC card shares the fixed 3:4 carousel geometry.
    const peerLi = [...carousel.querySelectorAll(':scope > li')].find(
      li => li !== firstLi
    );

    return {
      pac: rect(pac),
      // offsetWidth/offsetHeight are transform-free (edge-dimmed peer cards
      // are scaled to 0.96 via transform, which would skew getBoundingClientRect).
      pacBox: { width: pac.offsetWidth, height: pac.offsetHeight },
      pacIsFirstCard: Boolean(firstLi?.contains(pac)),
      peerCard: peerLi
        ? { width: peerLi.offsetWidth, height: peerLi.offsetHeight }
        : null,
      tabBar: tabBar ? { top: tabBar.getBoundingClientRect().top } : null,
      hero: hero ? rect(hero) : null,
      cover: cover
        ? {
            height: cover.getBoundingClientRect().height,
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

      // The featured release card (PAC) is the FIRST card of the single home
      // carousel — the old stacked bento strip above the carousel is gone.
      expect(
        layout.pacIsFirstCard,
        `${viewport.label} featured release card should be the first carousel card`
      ).toBe(true);

      // Same fixed 3:4 geometry as every other card in the track.
      if (layout.peerCard) {
        expect(
          Math.abs(layout.pacBox.height - layout.peerCard.height),
          `${viewport.label} featured card should match peer card height`
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(layout.pacBox.width - layout.peerCard.width),
          `${viewport.label} featured card should match peer card width`
        ).toBeLessThanOrEqual(2);
      }
      expect(
        Math.abs(layout.pacBox.width / layout.pacBox.height - 0.75),
        `${viewport.label} featured card should keep the 3:4 card aspect`
      ).toBeLessThanOrEqual(0.02);

      if (layout.hero) {
        expect(
          layout.pac.top,
          `${viewport.label} featured card should sit below hero identity`
        ).toBeGreaterThanOrEqual(layout.hero.bottom + 4);
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

      if (viewport.height <= 820 && layout.cover) {
        // Token-driven hero: clamp(220px, 34svh, 400px) — the old ≤190px
        // shrink-wrap band is gone and the hero never collapses.
        expect(
          layout.cover.height,
          `${viewport.label} home hero should keep its 220px floor on compact viewports`
        ).toBeGreaterThanOrEqual(220);
        expect(
          layout.cover.height,
          `${viewport.label} home hero should stay within the 400px token cap`
        ).toBeLessThanOrEqual(400);
      }
    });
  }
});

test.describe('Public Profile Home Carousel @smoke @critical', () => {
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
