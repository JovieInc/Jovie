import { expect, type Page, test } from '@playwright/test';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const PROFILE_MODES = [
  { mode: 'profile', query: '' },
  { mode: 'listen', query: '?mode=listen' },
  { mode: 'tip', query: '?mode=tip' },
  { mode: 'subscribe', query: '?mode=subscribe' },
  { mode: 'about', query: '?mode=about' },
] as const;

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

function isUnavailablePage(text: string): boolean {
  const body = text.toLowerCase();
  return (
    body.includes('profile not found') ||
    body.includes('temporarily unavailable') ||
    body.includes('loading jovie profile')
  );
}

async function assertProfilePageHealthy(page: Page) {
  const bodyText =
    (await page
      .locator('body')
      .textContent()
      .catch(() => '')) ?? '';
  expect(
    bodyText.toLowerCase().includes('application error') ||
      bodyText.toLowerCase().includes('internal server error') ||
      bodyText.toLowerCase().includes('unhandled runtime error'),
    'Public profile mode rendered an error boundary page'
  ).toBe(false);

  return bodyText;
}

test.describe('Public Profile Modes Smoke Coverage @smoke @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('mode × breakpoint coverage', () => {
    for (const breakpoint of BREAKPOINTS) {
      for (const profileMode of PROFILE_MODES) {
        test(`${profileMode.mode} mode renders at ${breakpoint.name}`, async ({
          page,
        }) => {
          await page.setViewportSize({
            width: breakpoint.width,
            height: breakpoint.height,
          });

          const route = `/${TEST_PROFILES.DUALIPA}${profileMode.query}`;
          const response = await smokeNavigate(page, route);
          expect(response?.status() ?? 0).toBeLessThan(500);

          await waitForHydration(page);
          const bodyText = await assertProfilePageHealthy(page);

          if (isUnavailablePage(bodyText)) {
            test.skip(
              true,
              `Profile ${TEST_PROFILES.DUALIPA} is unavailable in this environment`
            );
            return;
          }

          await expect(page.locator('h1').first()).toContainText(/Dua Lipa/i, {
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });

          if (profileMode.mode === 'profile') {
            await expect(page).toHaveURL(
              new RegExp(`/${TEST_PROFILES.DUALIPA}$`)
            );
          } else {
            await expect(page).toHaveURL(
              new RegExp(`/${TEST_PROFILES.DUALIPA}\\?mode=${profileMode.mode}`)
            );
          }
        });
      }
    }
  });

  test.describe('mobile drawer coverage by mode', () => {
    for (const profileMode of PROFILE_MODES) {
      test(`${profileMode.mode} mode can open mobile drawers when available`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 812 });

        const route = `/${TEST_PROFILES.DUALIPA}${profileMode.query}`;
        const response = await smokeNavigate(page, route);
        expect(response?.status() ?? 0).toBeLessThan(500);

        await waitForHydration(page);
        const bodyText = await assertProfilePageHealthy(page);
        if (isUnavailablePage(bodyText)) {
          test.skip(
            true,
            `Profile ${TEST_PROFILES.DUALIPA} is unavailable in this environment`
          );
          return;
        }

        const drawerChecks = [
          {
            selector: page.getByRole('button', { name: 'Listen now' }).first(),
            openedText: /listen on/i,
            closeSelector: page.getByRole('button', { name: 'Close' }).first(),
          },
          {
            selector: page.locator('[data-testid="tip-trigger"]').first(),
            openedText: /tip\s+dua lipa/i,
            closeSelector: page.getByRole('button', { name: 'Close' }).first(),
          },
          {
            selector: page.locator('[data-testid="contacts-trigger"]').first(),
            openedText: /contact dua lipa/i,
            closeSelector: null,
          },
        ] as const;

        const openedDrawers: string[] = [];

        for (const drawer of drawerChecks) {
          if (!(await drawer.selector.isVisible().catch(() => false))) {
            continue;
          }

          await drawer.selector.click();
          await expect(page.getByText(drawer.openedText)).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
          openedDrawers.push(String(drawer.openedText));

          if (
            drawer.closeSelector &&
            (await drawer.closeSelector.isVisible().catch(() => false))
          ) {
            await drawer.closeSelector.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(200);
        }

        await testInfo.attach('opened-drawers', {
          body: JSON.stringify(
            { mode: profileMode.mode, openedDrawers },
            null,
            2
          ),
          contentType: 'application/json',
        });
      });
    }
  });

  test.describe('deep link routing by mode', () => {
    const deepLinks = [
      { mode: 'listen', path: 'listen' },
      { mode: 'tip', path: 'tip' },
      { mode: 'subscribe', path: 'subscribe' },
      { mode: 'about', path: 'about' },
    ] as const;

    for (const deepLink of deepLinks) {
      test(`${deepLink.path} deep link resolves to ${deepLink.mode} mode`, async ({
        page,
      }) => {
        const response = await smokeNavigate(
          page,
          `/${TEST_PROFILES.DUALIPA}/${deepLink.path}`
        );
        expect(response?.status() ?? 0).toBeLessThan(500);

        await waitForHydration(page);
        const bodyText = await assertProfilePageHealthy(page);
        if (isUnavailablePage(bodyText)) {
          test.skip(
            true,
            `Profile ${TEST_PROFILES.DUALIPA} is unavailable in this environment`
          );
          return;
        }

        await expect(page).toHaveURL(
          new RegExp(`/${TEST_PROFILES.DUALIPA}\\?mode=${deepLink.mode}`)
        );
      });
    }
  });
});
