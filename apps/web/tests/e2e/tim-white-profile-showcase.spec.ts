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
      page.getByRole('heading', { name: 'Primary Action Card States' })
    ).toBeVisible();
    await expect(page.getByText('Latest release')).toBeVisible();
    await expect(page.getByText('Countdown')).toBeVisible();
    await expect(page.getByText('Nearby tour')).toBeVisible();
    await expect(page.getByText('Next tour')).toBeVisible();
    await expect(page.getByText('Playlist fallback')).toBeVisible();
    await expect(page.getByText('Listen fallback')).toBeVisible();
    await expect(page.getByText('w/ Cosmic Gate')).toBeVisible();
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
      page.getByRole('heading', { name: 'Inline Notifications Flow' })
    ).toBeVisible();
    await expect(page.getByText('Button')).toBeVisible();
    await expect(page.getByText('Email')).toBeVisible();
    await expect(page.getByText('Otp')).toBeVisible();
    await expect(page.getByText('Otp Error')).toBeVisible();
    await expect(page.getByText('Name')).toBeVisible();
    await expect(page.getByText('Birthday')).toBeVisible();
    await expect(page.getByText('Done')).toBeVisible();
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
    await expect(page.getByText('This Is Tim White')).toBeVisible();
  });
});
