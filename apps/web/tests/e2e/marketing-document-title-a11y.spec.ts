import { ABOUT_COPY, ABOUT_FACTS } from '@/data/aboutCopy';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The document title is what a browser tab and a screen reader announce.
 * Root metadata uses `%s | Jovie`, so a title that already names Jovie must
 * stay absolute or the announcement doubles.
 */
const ROUTES = [
  { path: '/compare', title: 'Compare | Jovie' },
  { path: '/pricing', title: 'Pricing | Jovie' },
  { path: '/cli', title: 'CLI | Jovie' },
  { path: '/integrations', title: 'Integrations | Jovie' },
  { path: '/compare/linktree', title: 'Jovie vs Linktree' },
] as const;

test.describe('marketing document titles', () => {
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

  test('links to the About page for the same Jovie organization', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(HOMEPAGE_EDITORIAL_COPY.seo.title);
    const organizations = () =>
      page
        .locator('script[type="application/ld+json"]')
        .evaluateAll(scripts =>
          scripts
            .map(script => JSON.parse(script.textContent ?? '{}'))
            .filter(node => node['@type'] === 'Organization')
        );

    const [publisher] = await organizations();
    expect(publisher).toMatchObject({
      '@id': expect.any(String),
      name: 'Jovie',
      sameAs: ABOUT_FACTS.organizationSameAs,
    });

    const aboutLink = page.getByRole('contentinfo').getByRole('link', {
      name: 'About',
      exact: true,
    });
    await expect(aboutLink).toBeVisible();
    await aboutLink.focus();
    await aboutLink.press('Enter');
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle(ABOUT_COPY.metadataTitle);
    await expect.poll(organizations).toEqual([
      expect.objectContaining({
        '@id': publisher['@id'],
        sameAs: publisher.sameAs,
      }),
    ]);
  });

  for (const route of ROUTES) {
    test(`${route.path} announces Jovie once`, async ({ page }) => {
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await expect(page).toHaveTitle(route.title);
      expect(await page.title()).not.toMatch(/Jovie \| Jovie/);
    });
  }
});
