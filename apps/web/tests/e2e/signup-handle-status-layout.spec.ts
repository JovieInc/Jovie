import {
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from '@playwright/test';

const HANDLE = 'longartistnameforfocus';
const SIGNUP_URL = `/signup?handle=${HANDLE}`;
const HANDLE_CHECK_PATTERN = '**/api/handle/check*';

type ElementBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

interface AuthControlGeometry {
  readonly back: ElementBox;
  readonly email: ElementBox;
  readonly modeSwitch: ElementBox;
}

interface LayoutCase {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly mobile?: boolean;
  readonly textScalePercent?: number;
}

const LAYOUT_CASES: readonly LayoutCase[] = [
  {
    name: 'desktop',
    viewport: { width: 1280, height: 900 },
  },
  {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    mobile: true,
  },
  {
    name: 'mobile at 200% root text',
    viewport: { width: 390, height: 1200 },
    mobile: true,
    textScalePercent: 200,
  },
];

async function applyTextScale(
  page: Page,
  textScalePercent: number | undefined
): Promise<void> {
  if (!textScalePercent) return;

  await page.addStyleTag({
    content: `html { font-size: ${textScalePercent}%; }`,
  });
}

async function readAuthControlGeometry(
  page: Page,
  textScalePercent: number | undefined
): Promise<AuthControlGeometry> {
  await applyTextScale(page, textScalePercent);
  await page.evaluate(() => document.fonts.ready);

  const targets = {
    back: page.locator('[data-auth-shell-back]'),
    email: page.locator('[data-auth-email-form-slot] input[type="email"]'),
    modeSwitch: page.locator('[data-auth-mode-switch]'),
  } as const;

  await Promise.all(
    Object.values(targets).map(target => expect(target).toBeVisible())
  );

  const [back, email, modeSwitch] = await Promise.all([
    targets.back.boundingBox(),
    targets.email.boundingBox(),
    targets.modeSwitch.boundingBox(),
  ]);

  if (!back || !email || !modeSwitch) {
    throw new Error(
      'Expected signup auth controls to have measurable geometry'
    );
  }

  return { back, email, modeSwitch };
}

function expectStableGeometry(
  baseline: AuthControlGeometry,
  current: AuthControlGeometry,
  state: string
): void {
  for (const control of Object.keys(baseline) as Array<
    keyof AuthControlGeometry
  >) {
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect
        .soft(
          current[control][dimension],
          `${control} ${dimension} shifted in ${state}`
        )
        .toBeCloseTo(baseline[control][dimension], 1);
    }
  }
}

async function expectAvailabilityState(
  page: Page,
  state: 'initial' | 'checking' | 'available' | 'taken' | 'error'
): Promise<void> {
  const status = page.getByTestId('signup-handle-status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveAttribute('data-availability-state', state);
}

async function openTerminalState(
  page: Page,
  state: 'available' | 'taken' | 'error',
  textScalePercent: number | undefined
): Promise<AuthControlGeometry> {
  await page.route(HANDLE_CHECK_PATTERN, async route => {
    if (state === 'error') {
      await route.abort('failed');
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: state === 'available' }),
    });
  });

  await page.goto(`${SIGNUP_URL}&layout_state=${state}`);
  await expectAvailabilityState(page, state);
  const geometry = await readAuthControlGeometry(page, textScalePercent);
  await page.unroute(HANDLE_CHECK_PATTERN);
  return geometry;
}

test.describe('signup handle availability layout stability', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Bounding-box contract is certified in Chromium'
  );

  for (const layoutCase of LAYOUT_CASES) {
    test(`keeps unrelated controls fixed across async states on ${layoutCase.name}`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const contextOptions = {
        viewport: layoutCase.viewport,
        isMobile: layoutCase.mobile,
        hasTouch: layoutCase.mobile,
        storageState: { cookies: [], origins: [] },
      };

      const initialContext = await browser.newContext({
        ...contextOptions,
        javaScriptEnabled: false,
      });
      const initialPage = await initialContext.newPage();
      await initialPage.goto(SIGNUP_URL);
      await expectAvailabilityState(initialPage, 'initial');
      const initialGeometry = await readAuthControlGeometry(
        initialPage,
        layoutCase.textScalePercent
      );
      await initialContext.close();

      const hydratedContext = await browser.newContext(contextOptions);
      const page = await hydratedContext.newPage();
      let pendingRoute: Route | undefined;
      await page.route(HANDLE_CHECK_PATTERN, route => {
        pendingRoute = route;
      });
      await page.goto(SIGNUP_URL);
      await expect.poll(() => pendingRoute !== undefined).toBe(true);
      await expectAvailabilityState(page, 'checking');
      const checkingGeometry = await readAuthControlGeometry(
        page,
        layoutCase.textScalePercent
      );
      expectStableGeometry(initialGeometry, checkingGeometry, 'checking');

      await pendingRoute?.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      });
      await expectAvailabilityState(page, 'available');
      const availableGeometry = await readAuthControlGeometry(
        page,
        layoutCase.textScalePercent
      );
      expectStableGeometry(initialGeometry, availableGeometry, 'available');
      await page.unroute(HANDLE_CHECK_PATTERN);

      for (const terminalState of ['taken', 'error'] as const) {
        const geometry = await openTerminalState(
          page,
          terminalState,
          layoutCase.textScalePercent
        );
        expectStableGeometry(initialGeometry, geometry, terminalState);
      }

      await hydratedContext.close();
    });
  }
});
