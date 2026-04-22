import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Tim White Profile Showcase', () => {
  test('renders the action-card showcase board', async ({ page }) => {
    await page.goto('/demo/showcase/tim-white-profile?showcase=cards', {
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);

    const showcase = page.getByTestId('demo-showcase-tim-white-profile-cards');
    await expect(showcase).toBeVisible();
    await expect(
      page.getByTestId('tim-white-cards-release-live')
    ).toHaveAttribute('data-state', 'release_live');
    await expect(
      page.getByTestId('tim-white-cards-release-countdown')
    ).toHaveAttribute('data-state', 'release_countdown');
    await expect(
      page.getByTestId('tim-white-cards-tour-nearby')
    ).toHaveAttribute('data-state', 'tour_nearby');
    await expect(page.getByTestId('tim-white-cards-tour-next')).toHaveAttribute(
      'data-state',
      'tour_next'
    );
    await expect(
      page.getByTestId('tim-white-cards-playlist-fallback')
    ).toHaveAttribute('data-state', 'playlist_fallback');
    await expect(
      page.getByTestId('tim-white-cards-listen-fallback')
    ).toHaveAttribute('data-state', 'listen_fallback');
  });

  test('renders the subscribe showcase board', async ({ page }) => {
    await page.goto('/demo/showcase/tim-white-profile?showcase=subscribe', {
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);

    const showcase = page.getByTestId(
      'demo-showcase-tim-white-profile-subscribe'
    );
    await expect(showcase).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-fans-opt-in')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-email')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-otp')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-otp-error')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-name')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-birthday')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-subscribe-done')
    ).toBeVisible();
  });

  test('supports single-state forcing for screenshot review', async ({
    page,
  }) => {
    await page.goto(
      '/demo/showcase/tim-white-profile?state=playlist-fallback',
      {
        waitUntil: 'domcontentloaded',
      }
    );
    await waitForHydration(page);

    await expect(
      page.getByTestId('demo-showcase-tim-white-profile-state')
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-phone-state-playlist-fallback')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-phone-state-playlist-fallback')
        .locator('[data-testid="profile-primary-action-card"]')
    ).toHaveAttribute('data-state', 'playlist_fallback');
  });
});
