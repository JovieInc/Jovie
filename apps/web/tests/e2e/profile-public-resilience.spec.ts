import type { BrowserContext, Page } from '@playwright/test';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_HEADER,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import { expect, test } from './setup';
import { TEST_PROFILES, waitForHydration } from './utils/smoke-test-utils';

const FIXED_AUDIENCE_ID = '5f2a65d3-9b89-4b19-9bca-e5a40d7cdce1';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

async function addStableAudienceCookie(
  context: BrowserContext,
  baseURL: string
) {
  await context.addCookies([
    {
      name: AUDIENCE_ANON_COOKIE,
      value: FIXED_AUDIENCE_ID,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function readPublicContract(page: Page) {
  return {
    heading: await page.locator('h1').first().textContent(),
    mode: await page
      .getByTestId('profile-compact-surface')
      .getAttribute('data-mode'),
    homeRailCount: await page.getByTestId('profile-home-rail').count(),
    pacCount: await page.getByTestId('profile-pac').count(),
    profileLink: await page
      .getByTestId('profile-identity-link')
      .getAttribute('href'),
    editControlCount: await page
      .getByRole('link', { name: /edit profile/i })
      .or(page.getByRole('button', { name: /edit profile/i }))
      .count(),
  };
}

async function readProfileGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        height: Math.round(box.height * 100) / 100,
        width: Math.round(box.width * 100) / 100,
      };
    };

    return {
      shell: rect('[data-testid="profile-compact-shell"]'),
      cover: rect('[data-testid="profile-cover"]'),
      media: rect('.profile-cover-home-media'),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

test.describe('public profile resilience', () => {
  test.setTimeout(180_000);

  test('is auth-independent for anonymous and authenticated visitors', async ({
    browser,
  }, testInfo) => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'Requires E2E_USE_TEST_AUTH_BYPASS=1'
    );

    const baseURL = testInfo.project.use.baseURL;
    expect(typeof baseURL).toBe('string');

    const anonymousContext = await browser.newContext({
      baseURL: baseURL as string,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    });
    const authenticatedContext = await browser.newContext({
      baseURL: baseURL as string,
      extraHTTPHeaders: {
        [TEST_MODE_HEADER]: TEST_AUTH_BYPASS_MODE,
        [TEST_USER_ID_HEADER]: 'profile-public-resilience-user',
      },
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    });

    try {
      await Promise.all([
        addStableAudienceCookie(anonymousContext, baseURL as string),
        addStableAudienceCookie(authenticatedContext, baseURL as string),
      ]);
      const anonymousPage = await anonymousContext.newPage();
      const authenticatedPage = await authenticatedContext.newPage();

      const [anonymousResponse, authenticatedResponse] = await Promise.all([
        anonymousPage.goto(`/${TEST_PROFILES.DUALIPA}`, {
          waitUntil: 'domcontentloaded',
        }),
        authenticatedPage.goto(`/${TEST_PROFILES.DUALIPA}`, {
          waitUntil: 'domcontentloaded',
        }),
      ]);
      expect(anonymousResponse?.status()).toBe(200);
      expect(authenticatedResponse?.status()).toBe(200);

      await Promise.all([
        waitForHydration(anonymousPage),
        waitForHydration(authenticatedPage),
      ]);
      expect(await readPublicContract(authenticatedPage)).toEqual(
        await readPublicContract(anonymousPage)
      );
    } finally {
      await anonymousContext.close();
      await authenticatedContext.close();
    }
  });

  test('keeps the hero and controls stable when profile media fails', async ({
    browser,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    expect(typeof baseURL).toBe('string');

    const normalContext = await browser.newContext({
      baseURL: baseURL as string,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    });
    const brokenMediaContext = await browser.newContext({
      baseURL: baseURL as string,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    });

    try {
      await Promise.all([
        addStableAudienceCookie(normalContext, baseURL as string),
        addStableAudienceCookie(brokenMediaContext, baseURL as string),
      ]);
      const normalPage = await normalContext.newPage();
      const brokenMediaPage = await brokenMediaContext.newPage();
      await brokenMediaPage.route(
        url => url.pathname === '/_next/image',
        route => route.fulfill({ status: 404, body: '' })
      );

      await normalPage.goto('/tim', { waitUntil: 'domcontentloaded' });
      await brokenMediaPage.goto('/tim', { waitUntil: 'domcontentloaded' });
      await Promise.all([
        waitForHydration(normalPage),
        waitForHydration(brokenMediaPage),
      ]);

      const brokenHero = brokenMediaPage.locator('.profile-cover-home-media');
      await expect(brokenHero.locator('img')).toHaveCount(0);
      await expect(brokenHero.locator('[role="img"]')).toBeVisible();
      await expect(
        brokenMediaPage.getByTestId('profile-hero-identity-block')
      ).toBeVisible();
      await expect(
        brokenMediaPage.getByRole('button', { name: 'Menu' })
      ).toBeVisible();

      const [normalGeometry, brokenGeometry] = await Promise.all([
        readProfileGeometry(normalPage),
        readProfileGeometry(brokenMediaPage),
      ]);
      expect(brokenGeometry).toEqual(normalGeometry);
      expect(brokenGeometry.overflowX).toBeLessThanOrEqual(0);
    } finally {
      await normalContext.close();
      await brokenMediaContext.close();
    }
  });
});
