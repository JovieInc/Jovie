import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
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
      '[data-testid="profile-mobile-notifications-step-email"]',
      '[data-testid="profile-mobile-notifications-flow"]',
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
    path: '/testartist/notifications',
    rootSelector: '[data-testid="notifications-page"]',
    readySelectors: [
      '[data-testid="notifications-page"]',
      '[data-testid="profile-mobile-notifications-step-email"]',
    ],
  },
] as const satisfies readonly MobileProfileScreen[];

type ViewportSnapshot = {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly horizontalOverflow: number;
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
    const viewportWidth = window.innerWidth;

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      horizontalOverflow: Math.max(documentWidth, bodyWidth) - viewportWidth,
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

  const outputDir = path.resolve(
    process.cwd(),
    '../../.context/profile-mobile-qa'
  );
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${viewport.id}-${screenId}.png`);

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

test.describe('Public Profile Mobile Viewport Stability @smoke @critical', () => {
  test.setTimeout(180_000);

  for (const viewport of MOBILE_PROFILE_VIEWPORTS) {
    test(`${viewport.label} public screens fill the mobile viewport`, async ({
      context,
    }, testInfo) => {
      for (const screen of PROFILE_MOBILE_SCREENS) {
        await test.step(screen.id, async () => {
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
            await waitForAnyVisible(screenPage, screen.readySelectors);

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
    });

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
          `/${TEST_PROFILES.DUALIPA}?mode=subscribe`,
          { timeout: 120_000 }
        );
        expect(response?.status() ?? 0).toBeLessThan(500);
        await waitForHydration(flowPage);
        await waitForAnyVisible(flowPage, [
          '[data-testid="profile-mobile-notifications-step-email"]',
        ]);

        const rootSelector = '[data-testid="profile-compact-surface"]';
        const emailInput = flowPage.getByTestId('mobile-email-input');
        await focusAndAssertNoShift(
          flowPage,
          emailInput,
          rootSelector,
          `${viewport.label} email`
        );
        await emailInput.fill(`mobile-${viewport.id}@example.com`);
        await flowPage
          .getByTestId('profile-mobile-notifications-step-email')
          .getByRole('button', { name: /^continue$/i })
          .click();

        const firstOtpDigit = flowPage.getByLabel('Digit 1 of 6');
        await focusAndAssertNoShift(
          flowPage,
          firstOtpDigit,
          rootSelector,
          `${viewport.label} otp`
        );
        await firstOtpDigit.pressSequentially('123456');

        const nameInput = flowPage.getByTestId('mobile-name-input');
        await focusAndAssertNoShift(
          flowPage,
          nameInput,
          rootSelector,
          `${viewport.label} name`
        );
        await nameInput.fill('Alex');
        await flowPage
          .getByTestId('profile-mobile-notifications-step-name')
          .getByRole('button', { name: /^continue$/i })
          .click();

        for (const [id, label] of [
          ['mobile-birthday-month', 'birthday month'],
          ['mobile-birthday-day', 'birthday day'],
          ['mobile-birthday-year', 'birthday year'],
        ] as const) {
          await focusAndAssertNoShift(
            flowPage,
            flowPage.getByTestId(id),
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
