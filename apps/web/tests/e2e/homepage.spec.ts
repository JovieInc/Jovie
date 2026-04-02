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

  test('hero renders with current headline, lead, and CTA button', async ({
    page,
  }) => {
    await expect(page.locator('h1')).toContainText('Drop more music.');
    await expect(page.locator('h1')).toContainText('Crush every release.');
    await expect(
      page.getByText(
        'Release pages, routing, fan capture, and follow-up in one system.'
      )
    ).toBeVisible();

    await expect(
      page.getByRole('link', { name: /start free/i }).first()
    ).toBeVisible();
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

  test('core homepage sections render in order', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        name: 'One release. Twenty-seven destinations.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Everything after the drop stays connected.',
      })
    ).toBeVisible();
  });

  test('final CTA renders with release-oriented actions', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        name: 'Start the next release before this one cools off.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See Profiles' })
    ).toBeVisible();
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(page.locator('h1')).toContainText('Drop more music.', {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.locator('h1')).toContainText('Crush every release.', {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expect(
      page.getByRole('link', { name: /start free/i }).first()
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
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
