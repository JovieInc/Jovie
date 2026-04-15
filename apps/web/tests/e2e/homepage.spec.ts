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

  test('renders the hero with phone, headline, and CTA', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(
      'The link your music deserves.'
    );
    await expect(page.getByTestId('homepage-claim-form')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Claim your profile' }).first()
    ).toBeVisible();
    await expect(page.getByTestId('homepage-hero-composition')).toBeVisible();
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
    await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
  });

  test('renders the 7-chapter narrative structure', async ({ page }) => {
    // Trust section
    await expect(page.getByTestId('homepage-trust')).toBeVisible();
    await expect(page.getByText('One profile.')).toBeVisible();

    // Chapter 1: Convert attention
    await page.getByTestId('homepage-chapter-1').scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: 'Turn attention into action.' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-sandbox')).toBeVisible();

    // Chapter 2: Get paid
    await page.getByTestId('homepage-chapter-2').scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', {
        name: 'Get paid.',
      })
    ).toBeVisible();
    await expect(page.getByText("That's it.")).toBeVisible();

    // Chapter 3: Know your fans
    await page.getByTestId('homepage-chapter-3').scrollIntoViewIfNeeded();
    await expect(
      page.getByText('Know who your fans are and when to reach them.')
    ).toBeVisible();
    await expect(page.getByText('Countdowns Built In.')).toBeVisible();
    await expect(page.getByText('Location-Aware.')).toBeVisible();

    // Philosophy
    await page.getByTestId('homepage-spec-section').scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: 'Built for artists' })
    ).toBeVisible();
    await expect(page.getByText('Opinionated.')).toBeVisible();
    await expect(page.getByText('By design.')).toBeVisible();
    await expect(page.getByText('Zero Setup.')).toBeVisible();
    await expect(page.getByText('Stupid Fast.')).toBeVisible();

    // Old sections gone
    await expect(page.getByTestId('homepage-interstitial')).toHaveCount(0);
    await expect(page.getByTestId('homepage-action-rail')).toHaveCount(0);

    // Final CTA
    await page.getByTestId('final-cta-section').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('final-cta-headline')).toHaveText(
      'Claim your profile.'
    );
    await expect(page.getByTestId('final-cta-action')).toHaveText(
      'Claim your profile'
    );
  });

  test('renders mobile layout correctly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(page.locator('h1')).toContainText(
      'The link your music deserves.',
      { timeout: SMOKE_TIMEOUTS.VISIBILITY }
    );
    await expect(page.getByTestId('homepage-trust')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const overflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        );
      });

      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test('loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForHydration(page);

    expect(errors).toEqual([]);
  });
});
