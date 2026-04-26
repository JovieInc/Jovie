import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

type Breakpoint = {
  readonly name: 'mobile' | 'tablet' | 'desktop';
  readonly width: number;
  readonly height: number;
};

const BREAKPOINTS: readonly Breakpoint[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

async function blockAnalytics(page: import('@playwright/test').Page) {
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

test.describe('Profile Notifications Hosts', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const breakpoint of BREAKPOINTS) {
    test(`home hero opens overlay flow @ ${breakpoint.name}`, async ({
      page,
    }) => {
      await blockAnalytics(page);
      await page.setViewportSize({
        width: breakpoint.width,
        height: breakpoint.height,
      });

      await page.goto('/dualipa', {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForHydration(page);

      await page.getByTestId('profile-inline-notifications-trigger').click();

      await expect(
        page.getByTestId('profile-mobile-notifications-flow')
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-preferences')
      ).toBeVisible();
    });

    test(`subscribe route auto-opens overlay flow @ ${breakpoint.name}`, async ({
      page,
    }) => {
      await blockAnalytics(page);
      await page.setViewportSize({
        width: breakpoint.width,
        height: breakpoint.height,
      });

      await page.goto('/dualipa?mode=subscribe', {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForHydration(page);

      await expect(
        page.getByTestId('profile-mobile-notifications-flow')
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-preferences')
      ).toBeVisible();
    });

    test(`dedicated notifications page auto-opens overlay flow @ ${breakpoint.name}`, async ({
      page,
    }) => {
      await blockAnalytics(page);
      await page.setViewportSize({
        width: breakpoint.width,
        height: breakpoint.height,
      });

      await page.goto('/testartist/notifications', {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForHydration(page);

      await expect(page.getByTestId('notifications-page')).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-flow')
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-preferences')
      ).toBeVisible();
    });

    test(`subscribe route shows manage screen for returning fans @ ${breakpoint.name}`, async ({
      page,
    }) => {
      await blockAnalytics(page);
      await page.addInitScript(() => {
        globalThis.localStorage.setItem(
          'jovie:notification-contacts',
          JSON.stringify({ email: 'fan@example.com' })
        );
      });
      await page.route('**/api/notifications/status**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            channels: { email: true, sms: false },
            details: { email: 'fan@example.com' },
            contentPreferences: {
              newMusic: true,
              tourDates: true,
              merch: true,
              general: true,
            },
            artistEmail: {
              optedIn: true,
              pendingProvider: false,
              visibleToArtist: true,
            },
          }),
        })
      );
      await page.setViewportSize({
        width: breakpoint.width,
        height: breakpoint.height,
      });

      await page.goto('/dualipa?mode=subscribe', {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await waitForHydration(page);

      await expect(
        page.getByTestId('profile-mobile-notifications-flow')
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-preferences')
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-sent-from')
      ).toBeVisible();
    });
  }
});
