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

  test('hero renders with current headline, lead, CTA, and premium cards', async ({
    page,
  }) => {
    await expect(page.locator('h1')).toContainText(
      'Drop more music. Crush every release.'
    );
    await expect(
      page.getByText(
        'Your artist page, every release page, and the launch workflow behind them all run in one system.'
      )
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /get started|start free/i }).first()
    ).toBeVisible();

    await expect(
      page.getByTestId('homepage-hero-profile-card').last()
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-hero-release-card').last()
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-hero-task-card-1').last()
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-hero-task-card-2').last()
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-hero-task-card-3').last()
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

  test('core homepage sections render in order with updated surfaces', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Profiles that convert.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Share every release. Reach every fan. Automatically.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'AI that knows the context.' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: 'A command center for your career.',
      })
    ).toBeVisible();

    await expect(
      page.getByTestId('homepage-release-destination-presave').first()
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-release-destination-live').first()
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'A command center for your career.' })
    ).toBeVisible();
  });

  test('final CTA renders with current actions', async ({ page }) => {
    await expect(page.getByTestId('final-cta-headline')).toBeVisible();
    await expect(page.getByTestId('final-cta-action')).toBeVisible();
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(page.locator('h1')).toContainText('Drop more music.', {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expect(
      page.getByTestId('homepage-hero-release-card').first()
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByTestId('homepage-hero-profile-card').first()
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expect(
      page.getByRole('link', { name: /get started|start free/i }).first()
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
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
    // No absurd countdown values from far-future dates
    expect(bodyText).not.toContain('2099');
    // No Calvin Harris attribution on homepage (The Deep End is Cosmic Gate & Tim White)
    expect(bodyText).not.toContain('Calvin Harris');
    // No empty state indicators
    await expect(page.getByText('Loading...')).toHaveCount(0);
    await expect(page.getByText('No releases')).toHaveCount(0);
  });

  test('all product screenshot images load successfully', async ({ page }) => {
    const images = page.locator('img[src*="product-screenshots"]');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      await img.scrollIntoViewIfNeeded();
      const naturalWidth = await img.evaluate(
        (el: HTMLImageElement) => el.naturalWidth
      );
      expect(naturalWidth).toBeGreaterThan(0);
    }
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
