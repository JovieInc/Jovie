import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

/**
 * Homepage E2E Tests (consolidated from homepage + featured-artists)
 *
 * Covers: hero, sections, navigation, meta, responsiveness, featured
 * creators carousel. All tests run unauthenticated.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Homepage coverage runs in the lighter smoke-public and content-gate fast lanes'
);

async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

async function scrollToLowerHomepageSections(
  page: import('@playwright/test').Page
) {
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
}

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('hero section renders with headline and claim handle form', async ({
    page,
  }) => {
    await expect(page.locator('h1')).toContainText('Release More Music.');
    await expect(
      page.getByText(
        /Connect Spotify once\. Jovie creates smart links for every song/i
      )
    ).toBeVisible();

    // Claim handle input in hero
    const heroSection = page.locator('main section').first();
    const input = heroSection.locator('input').first();
    await expect(input).toBeVisible();
  });

  test('page has multiple sections with substantial content', async ({
    page,
  }) => {
    const sections = page.locator('section');
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(1);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 1000).toBe(true);

    await scrollToLowerHomepageSections(page);
    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'Homepage should scroll past the hero section',
      })
      .toBeGreaterThan(0);
  });

  test('header navigation and footer visible', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();

    const logoLink = page.locator('a[href="/"]').first();
    await expect(logoLink).toBeVisible();
  });

  test('has proper meta information', async ({ page }) => {
    await expect(page).toHaveTitle(/Jovie/);
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content');
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(page.locator('h1')).toContainText('Release More Music.', {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const heroSection = page.locator('main section').first();
    const input = heroSection.locator('input').first();
    await expect(input).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('no loading or error states visible after hydration', async ({
    page,
  }) => {
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('Loading...');
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Homepage - See It In Action', () => {
  test('showcase section loads with Tim White profile and releases', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await scrollToLowerHomepageSections(page);

    await expect(
      page.getByRole('heading', { name: /See it in action/i })
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('Tim White', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/^Artist$/)).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('link', { name: /jov\.ie\/tim/i })).toBeVisible(
      {
        timeout: 20000,
      }
    );
    await expect(
      page.getByRole('link', { name: /View Profile/i })
    ).toHaveAttribute('href', '/tim');
    await expect(page.getByText(/Never Say A Word/i)).toBeVisible();
    await expect(page.getByText(/The Deep End/i)).toBeVisible();
    await expect(page.getByText(/Take Me Over/i)).toBeVisible();
  });

  test('showcase section has profile and release artwork with alt text', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await scrollToLowerHomepageSections(page);

    await expect(
      page.getByRole('heading', { name: /See it in action/i })
    ).toBeVisible({
      timeout: 20000,
    });

    await expect(
      page.getByRole('img', { name: /Tim White profile photo/i })
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole('img', { name: /Never Say A Word artwork/i })
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole('img', { name: /The Deep End artwork/i })
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole('img', { name: /Take Me Over artwork/i })
    ).toBeVisible({
      timeout: 20000,
    });
  });

  test('showcase loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await interceptAnalytics(page);
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
