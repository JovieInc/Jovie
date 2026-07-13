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
  test.setTimeout(120_000);

  for (const breakpoint of BREAKPOINTS) {
    test(`home alerts entry renders @ ${breakpoint.name}`, async ({ page }) => {
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

      if (breakpoint.name === 'desktop') {
        const desktopAlertsCard = page.getByTestId(
          'profile-desktop-alerts-card'
        );
        const hasDesktopAlertsCard = await desktopAlertsCard
          .isVisible({ timeout: 2500 })
          .catch(() => false);

        if (hasDesktopAlertsCard) {
          await expect(
            desktopAlertsCard.getByRole('switch', { name: /new music/i })
          ).toBeVisible();
          return;
        }

        await expect(
          page
            .getByTestId('profile-home-alerts-row')
            .or(page.getByTestId('profile-home-alerts-fallback-card'))
            .first()
        ).toBeVisible();
        return;
      }

      const trigger = page
        .getByTestId('profile-home-alerts-row')
        .or(page.getByTestId('profile-home-alerts-fallback-card'))
        .first();
      await expect(trigger).toBeVisible();

      if (breakpoint.name === 'tablet') {
        return;
      }

      await trigger.click();

      await expect(
        page.getByTestId('profile-mobile-notifications-flow').first()
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-email').first()
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
        page.getByTestId('profile-mobile-notifications-flow').first()
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-step-email').first()
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
        page.getByTestId('profile-mobile-notifications-step-email')
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
        page.getByTestId('profile-mobile-notifications-flow').first()
      ).toBeVisible();
      await expect(
        page
          .getByTestId('profile-mobile-notifications-step-preferences')
          .first()
      ).toBeVisible();
      await expect(
        page.getByTestId('profile-mobile-notifications-sent-from').first()
      ).toBeVisible();
    });
  }
});
