import AxeBuilder from '@axe-core/playwright';
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import {
  clearAppFlagOverrides,
  installAppFlagOverrides,
} from './helpers/app-flag-overrides';

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const ONBOARDING_QA_HANDLE = 'jov1813qa';

test.use({ storageState: { cookies: [], origins: [] } });

function getBaseUrl(): string {
  return process.env.BASE_URL ?? 'http://localhost:3100';
}

async function resolveCreatorUserId(
  request: APIRequestContext
): Promise<string> {
  const response = await request.post(
    new URL('/api/dev/test-auth/session', getBaseUrl()).toString(),
    {
      data: { persona: 'creator' },
    }
  );
  expect(response.ok(), 'Failed to resolve creator test persona').toBe(true);

  const payload = (await response.json()) as { userId?: string | null };
  const userId = payload.userId?.trim();
  expect(userId, 'Missing creator test persona userId').toBeTruthy();
  return userId!;
}

async function prepareCreatorSession(
  page: Page,
  userId: string
): Promise<void> {
  const baseUrl = getBaseUrl();
  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: userId,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: 'creator',
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    return (
      Math.max(documentElement.scrollWidth, body.scrollWidth) -
      window.innerWidth
    );
  });

  expect(
    overflow,
    'Page should not overflow the mobile viewport'
  ).toBeLessThanOrEqual(1);
}

async function assertNoCriticalA11yViolations(
  page: Page,
  includeSelector: string
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(includeSelector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const criticalViolations = results.violations.filter(
    violation => violation.impact === 'critical'
  );

  expect(criticalViolations).toEqual([]);
}

async function stubHandleAvailability(page: Page): Promise<void> {
  await page.route('**/api/handle/check*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true }),
    })
  );
}

test.describe('Auth and onboarding Design V1 mobile QA', () => {
  test.setTimeout(180_000);

  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );

  test('flagged sign-in and sign-up shells fit the mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);

    for (const route of [APP_ROUTES.SIGNIN, APP_ROUTES.SIGNUP]) {
      await clearAppFlagOverrides(page);
      await installAppFlagOverrides(page, { DESIGN_V1: true });

      await page.goto(route, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });

      const shell = page.locator('[data-auth-shell]');
      await expect(shell).toHaveAttribute('data-design-v1-auth', 'true', {
        timeout: 30_000,
      });
      await expect(shell).toHaveAttribute('data-auth-layout-variant', 'split');
      await expect(page.locator('#auth-form')).toBeVisible({
        timeout: 30_000,
      });

      await assertNoHorizontalOverflow(page);
      await assertNoCriticalA11yViolations(page, '[data-auth-shell]');
    }
  });

  test('canonical onboarding chat preserves mobile layout for handle and resume links', async ({
    page,
    request,
  }) => {
    const userId = await resolveCreatorUserId(request);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await stubHandleAvailability(page);
    await installAppFlagOverrides(page, { DESIGN_V1: true });
    await prepareCreatorSession(page, userId);

    await page.goto(`${APP_ROUTES.ONBOARDING}?handle=${ONBOARDING_QA_HANDLE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    const shell = page.locator('[data-app-shell-frame="true"]');
    const chat = page.getByTestId('onboarding-chat');
    await expect(shell).toBeVisible({ timeout: 30_000 });
    await expect(chat).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(
      new RegExp(`/start\\?handle=${ONBOARDING_QA_HANDLE}`)
    );
    await assertNoHorizontalOverflow(page);
    await assertNoCriticalA11yViolations(page, '[data-app-shell-frame="true"]');

    await page.goto(
      `${APP_ROUTES.ONBOARDING}?handle=${ONBOARDING_QA_HANDLE}&resume=dsp`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      }
    );

    await expect(shell).toBeVisible({ timeout: 30_000 });
    await expect(chat).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/start\?.*resume=/);
    await assertNoHorizontalOverflow(page);
  });
});
