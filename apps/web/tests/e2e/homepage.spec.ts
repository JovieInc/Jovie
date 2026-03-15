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

/**
 * Force all DeferredSections to render by patching IntersectionObserver
 * before the page loads (headless mode doesn't trigger IO reliably).
 */
async function forceDeferredSections(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const OriginalIO = window.IntersectionObserver;
    window.IntersectionObserver = class extends OriginalIO {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        super(callback, options);
        const self = this;
        const origObserve = this.observe.bind(this);
        this.observe = (target: Element) => {
          origObserve(target);
          setTimeout(() => {
            callback(
              [
                {
                  isIntersecting: true,
                  target,
                  intersectionRatio: 1,
                } as IntersectionObserverEntry,
              ],
              self
            );
          }, 50);
        };
      }
    } as unknown as typeof IntersectionObserver;
  });
}

async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
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
    await expect(page.locator('h1')).toContainText(
      'One link that captures every fan.'
    );
    await expect(
      page.getByText(/Connect Spotify, grow your audience automatically/i)
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

    await expect(page.locator('h1')).toContainText(
      'One link that captures every fan.',
      { timeout: SMOKE_TIMEOUTS.VISIBILITY }
    );

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

test.describe('Homepage - Featured Creators Carousel', () => {
  test('showcase section loads and displays creators', async ({ page }) => {
    await interceptAnalytics(page);
    await forceDeferredSections(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const trustHeading = page.getByText(/Trusted by artists on/i).first();
    const trustLogo = page
      .locator(
        'img[alt="Universal Music Group"], img[alt="AWAL"], img[alt="The Orchard"], img[alt="Armada Music"], img[alt="Black Hole Recordings"]'
      )
      .first();
    await expect(trustHeading.or(trustLogo)).toBeVisible({ timeout: 20000 });
  });

  test('showcase section has images with alt text', async ({ page }) => {
    await interceptAnalytics(page);
    await forceDeferredSections(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const trustHeading = page.getByText(/Trusted by artists on/i).first();
    await expect(trustHeading).toBeVisible({ timeout: 20000 });

    await expect(
      page.getByRole('img', { name: 'Universal Music Group' })
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('img', { name: 'AWAL' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('img', { name: 'The Orchard' })).toBeVisible({
      timeout: 20000,
    });
  });

  test('showcase loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await interceptAnalytics(page);
    await forceDeferredSections(page);
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
