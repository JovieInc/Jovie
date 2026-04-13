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

async function scrollStorySceneIntoFocus(
  page: import('@playwright/test').Page,
  testId: string
) {
  const scene = page.getByTestId(testId);
  await scene.scrollIntoViewIfNeeded();
  await scene.evaluate(node =>
    node.scrollIntoView({ block: 'center', inline: 'nearest' })
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
        'Drive more streams automatically, notify every fan every time, and get paid from one profile that updates itself.'
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
    const header = page.getByTestId('header-nav');
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
    await expect(
      page.getByRole('heading', { name: 'Drive more streams automatically.' })
    ).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Notify every fan every time.' })
    ).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Get paid.' }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Say thanks.' }).first()
    ).toBeVisible();

    await scrollStorySceneIntoFocus(page, 'homepage-story-scene-streams-video');

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-phone-state-streams-video')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-overlay-email-preview')
    ).toBeVisible();

    await scrollStorySceneIntoFocus(
      page,
      'homepage-story-scene-fans-song-alert'
    );

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-phone-state-fans-song-alert')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-overlay-email-preview')
    ).toBeVisible();

    await scrollStorySceneIntoFocus(page, 'homepage-story-scene-tips-open');

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-phone-state-tips-open')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-story-chapter-tips')
        .getByTestId('homepage-tip-conversion-cards')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-story-chapter-tips')
        .getByTestId('homepage-tip-thanks-note')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('profile-mode-drawer-tip')
    ).toBeVisible();

    await scrollStorySceneIntoFocus(
      page,
      'homepage-story-scene-tips-apple-pay'
    );

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-overlay-apple-pay')
    ).toBeVisible();

    await scrollStorySceneIntoFocus(page, 'homepage-story-scene-tips-followup');

    await expect(
      page
        .getByTestId('homepage-desktop-phone-rail')
        .getByTestId('homepage-overlay-email-preview')
    ).toBeVisible();
  });

  test('comparison, modules, spec chapter, and final CTA render with the new copy', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Keep the momentum going.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Keep every door open.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Opinionated where it counts.',
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-opinionated-design-card')
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
      page.getByTestId('homepage-mobile-scene-streams-latest')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByTestId('homepage-mobile-scene-tips-followup')
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
