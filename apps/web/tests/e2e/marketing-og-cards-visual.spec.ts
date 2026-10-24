import { expect, test } from './setup';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Marketing OG cards (JOV-7864). Every indexable route that gained a static
 * card shares that card through Open Graph and the Twitter summary, so a
 * link unfurls with the page's own image instead of the generic default.
 */
const OG_CARD_ROUTES = [
  { path: '/about', image: '/og/about.png' },
  { path: '/alternatives', image: '/og/alternatives.png' },
  {
    path: '/alternatives/link-in-bio',
    image: '/og/alternatives-link-in-bio.png',
  },
  { path: '/alternatives/linktree', image: '/og/alternatives-linktree.png' },
  { path: '/api-versioning', image: '/og/api-versioning.png' },
  { path: '/cli', image: '/og/cli.png' },
  { path: '/compare', image: '/og/compare.png' },
  { path: '/compare/linkfire', image: '/og/compare-linkfire.png' },
  { path: '/compare/linktree', image: '/og/compare-linktree.png' },
  { path: '/developers', image: '/og/developers.png' },
  { path: '/download', image: '/og/download.png' },
  { path: '/support', image: '/og/support.png' },
] as const;

test.describe('marketing OG cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
  });

  for (const route of OG_CARD_ROUTES) {
    test(`${route.path} shares its own OG card`, async ({ page }) => {
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      const ogImage = page.locator('meta[property="og:image"]');
      await expect(ogImage).toHaveCount(1);
      await expect(ogImage).toHaveAttribute(
        'content',
        new RegExp(`${route.image}$`)
      );

      const twitterImage = page.locator('meta[name="twitter:image"]');
      await expect(twitterImage).toHaveCount(1);
      await expect(twitterImage).toHaveAttribute(
        'content',
        new RegExp(`${route.image}$`)
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image'
      );
    });
  }
});
