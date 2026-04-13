import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Homepage coverage runs in the lighter smoke-public and content-gate fast lanes'
);

async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('hero renders with adaptive-profile clarity and proof hidden by default', async ({
    page,
  }) => {
    await expect(page.locator('h1')).toContainText(
      'The link your music deserves.'
    );
    await expect(
      page.getByText(
        'One artist profile that updates itself for every release and notifies fans automatically.'
      )
    ).toBeVisible();
    await expect(page.getByTestId('homepage-hero-url-lockup')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Claim your profile' }).first()
    ).toBeVisible();
    await expect(page.getByTestId('homepage-secondary-cta')).toHaveCount(0);
    await expect(page.getByTestId('homepage-live-proof')).toHaveCount(0);
  });

  test('header shows auth actions without marketing nav links', async ({
    page,
  }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
    await expect(page.locator('a[href="#release"]')).toHaveCount(0);
    await expect(page.locator('a[href="#profile"]')).toHaveCount(0);
    await expect(page.locator('a[href="#audience"]')).toHaveCount(0);
    await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
  });

  test('desktop story scenes stay in order and update the sticky phone on scroll', async ({
    page,
  }) => {
    const sceneHeadings = page.locator(
      '[data-testid^="homepage-story-scene-"] h2'
    );
    await expect(sceneHeadings).toHaveText([
      'One link.',
      'Before the drop.',
      "When it's out.",
      'Fans opt in once.',
      "When you're on the road.",
      'When they want to support.',
      'When business comes calling.',
      'It never goes dark.',
    ]);

    await page
      .getByTestId('homepage-story-scene-when-its-out')
      .scrollIntoViewIfNeeded();

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-phone-state-listen')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('profile-mode-drawer-listen')
    ).toBeVisible();

    await page
      .getByTestId('homepage-story-scene-on-the-road')
      .scrollIntoViewIfNeeded();

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-phone-state-tour')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('profile-mode-drawer-tour')
    ).toBeVisible();

    await page
      .getByTestId('homepage-story-scene-support')
      .scrollIntoViewIfNeeded();

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('profile-mode-drawer-tip')
    ).toBeVisible();

    await page
      .getByTestId('homepage-story-scene-business-calling')
      .scrollIntoViewIfNeeded();

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('profile-mode-drawer-contact')
    ).toBeVisible();
  });

  test('infrastructure and final CTA render with the new copy', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Runs itself underneath.' })
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-headline')).toHaveText(
      'Claim your profile.'
    );
    await expect(page.getByTestId('final-cta-action')).toHaveText(
      'Claim your profile'
    );
    await expect(
      page.getByRole('link', { name: 'See artist profiles' })
    ).toBeVisible();
  });

  test('stacks the story on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(page.locator('h1')).toContainText(
      'The link your music deserves.',
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    await expect(page.getByTestId('homepage-mobile-story')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('homepage-mobile-phone-rail')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByTestId('homepage-mobile-scene-one-link')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByTestId('homepage-mobile-scene-never-goes-dark')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expect(
      page.getByRole('link', { name: 'Claim your profile' }).first()
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(
      page
        .getByTestId('homepage-mobile-phone-rail')
        .locator('[data-testid^="homepage-phone-state-"]')
    ).toHaveCount(1);
  });

  test('has proper meta information and no obvious error state', async ({
    page,
  }) => {
    await expect(page).toHaveTitle(/Jovie/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content'
    );
    await expect(page.locator('body')).not.toContainText('Loading...');
    await expect(page.locator('body')).not.toContainText(
      'Unhandled Runtime Error'
    );
  });

  test('marketing content has no empty state or placeholder indicators', async ({
    page,
  }) => {
    const bodyText = (await page.textContent('body')) ?? '';

    expect(bodyText).not.toContain('2099');
    expect(bodyText).not.toContain('Calvin Harris');
    await expect(page.getByText('Loading...')).toHaveCount(0);
    await expect(page.getByText('No releases')).toHaveCount(0);
  });

  test('loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForHydration(page);

    const criticalErrors = errors.filter(
      error =>
        !error.includes('Failed to load resource') &&
        !error.includes('net::ERR_FAILED') &&
        !error.includes('i.scdn.co') &&
        !error.includes('CORS') &&
        !error.includes('Clerk') &&
        !error.includes('Sentry')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
