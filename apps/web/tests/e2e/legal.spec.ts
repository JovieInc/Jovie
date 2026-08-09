import { expect, test } from './setup';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const LEGAL_LAYOUT_ROUTES = [
  { pathname: '/legal/cookies', title: 'Cookie Policy' },
  { pathname: '/legal/dmca', title: 'DMCA Policy' },
  { pathname: '/legal/terms', title: 'Terms of Service' },
] as const;
const LEGAL_LAYOUT_VIEWPORTS = [
  { width: 390, height: 844, expectedContentPaddingTop: 64 },
  { width: 1024, height: 1200, expectedContentPaddingTop: 80 },
] as const;

/**
 * Legal Pages Tests
 *
 * NOTE: Legal pages (privacy policy, terms of service) are public
 * and must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Legal Pages', () => {
  test.skip(
    FAST_ITERATION,
    'Legal page coverage runs in the slower public-content lane'
  );

  // Legal pages use heavy markdown rendering which can take 90s+ on first Turbopack compile
  test.setTimeout(300_000);

  test('preserves shared header geometry at Pen desktop and narrow viewports', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const viewport of LEGAL_LAYOUT_VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const route of LEGAL_LAYOUT_ROUTES) {
        const response = await page.goto(route.pathname, {
          timeout: 180_000,
          waitUntil: 'domcontentloaded',
        });

        expect(response?.status(), `${route.pathname} must return 200`).toBe(
          200
        );
        await expect(page).toHaveURL(new RegExp(`${route.pathname}$`));
        await expect(
          page.getByRole('heading', { level: 1, name: route.title })
        ).toBeVisible();

        const metrics = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>(
            '[data-testid="header-nav"]'
          );
          const main = document.querySelector<HTMLElement>('#main-content');
          const content = document.querySelector<HTMLElement>(
            '.public-legal-content'
          );

          if (!header || !main || !content) {
            throw new Error('Shared legal shell geometry anchors are missing');
          }

          const headerRect = header.getBoundingClientRect();
          const mainRect = main.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const mainStyle = getComputedStyle(main);
          const contentStyle = getComputedStyle(content);

          return {
            bodyScrollWidth: document.body.scrollWidth,
            contentPaddingTop: Number.parseFloat(contentStyle.paddingTop),
            contentTop: contentRect.top,
            documentScrollWidth: document.documentElement.scrollWidth,
            headerBottom: headerRect.bottom,
            headerHeight: headerRect.height,
            innerWidth: window.innerWidth,
            mainPaddingTop: Number.parseFloat(mainStyle.paddingTop),
            mainTop: mainRect.top,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
              .matches,
            scrollBehavior: getComputedStyle(document.documentElement)
              .scrollBehavior,
          };
        });

        expect(metrics.headerHeight).toBeGreaterThan(0);
        expect(
          Math.abs(metrics.mainPaddingTop - metrics.headerHeight)
        ).toBeLessThanOrEqual(1);
        expect(metrics.contentTop).toBeGreaterThanOrEqual(
          metrics.headerBottom - 1
        );
        expect(metrics.contentPaddingTop).toBe(
          viewport.expectedContentPaddingTop
        );
        expect(metrics.mainTop).toBeLessThanOrEqual(metrics.headerBottom);
        expect(metrics.documentScrollWidth).toBeLessThanOrEqual(
          metrics.innerWidth + 1
        );
        expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(
          metrics.innerWidth + 1
        );
        expect(metrics.reducedMotion).toBe(true);
        expect(metrics.scrollBehavior).toBe('auto');
      }
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test.describe('Privacy Policy', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });
    });

    test('displays privacy policy page correctly', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Privacy Policy');
      await expect(page.getByText('Last updated: February 2026')).toBeVisible();
      await expect(
        page.getByText('We collect only what is essential')
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Download PDF' })
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Document navigation' }).first()
      ).toBeVisible();

      // Check main section headings (must match actual markdown content)
      await expect(
        page.getByRole('heading', { name: 'Information We Collect' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'How We Use Your Information' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Data Sharing', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Data Storage and Protection' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Your Preferences and Controls' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Contact Us' })
      ).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header logo link
      await expect(page.getByTestId('site-logo-link')).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Privacy Policy/);

      // Check meta description exists (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Information We Collect' })
      ).toBeVisible();
    });
  });

  test.describe('Terms of Service', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/terms', { timeout: 180_000 });
    });

    test('displays terms of service page correctly', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Terms of Service');
      await expect(page.getByText('Last updated: February 2026')).toBeVisible();
      await expect(
        page.getByText('Jovie is governed by clear policies')
      ).toBeVisible();

      // Check main section headings (must match actual markdown content)
      await expect(
        page.getByRole('heading', { name: 'Acceptance of Terms' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'What Jovie Provides' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'User Accounts' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Content and Conduct' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Intellectual Property' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Contact Information' })
      ).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header logo link
      await expect(page.getByTestId('site-logo-link')).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Terms of Service/);

      // Check meta description exists (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Acceptance of Terms' })
      ).toBeVisible();
    });
  });

  test.describe('Cookie Policy', () => {
    test('keeps GFM tables readable without page-level mobile overflow', async ({
      page,
    }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/legal/cookies', { timeout: 180_000 });

      const table = page.locator('table').first();
      await expect(table).toBeVisible();
      await expect(
        page.locator('code').filter({ hasText: 'jv_cc' }).first()
      ).toBeVisible();

      const overflow = await page.evaluate(() => {
        const firstTable = document.querySelector('table');
        const previousScrollLeft = firstTable?.scrollLeft ?? 0;
        if (firstTable) {
          firstTable.scrollLeft = 50;
        }
        const nextScrollLeft = firstTable?.scrollLeft ?? 0;
        if (firstTable) {
          firstTable.scrollLeft = previousScrollLeft;
        }

        return {
          documentWidth: document.documentElement.scrollWidth,
          tableCanScroll: nextScrollLeft > previousScrollLeft,
          tableFits:
            (firstTable?.scrollWidth ?? 0) <= (firstTable?.clientWidth ?? 0),
          viewportWidth: window.innerWidth,
        };
      });

      expect(overflow.documentWidth).toBeLessThanOrEqual(
        overflow.viewportWidth + 2
      );
      expect(overflow.tableCanScroll || overflow.tableFits).toBe(true);
    });
  });

  test.describe('Navigation between legal pages', () => {
    test('can navigate from privacy to home', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });

      // Click on logo to go home
      await page.getByTestId('site-logo-link').click();
      await expect(page).toHaveURL('/');
    });

    test('can navigate from terms to home', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/terms', { timeout: 180_000 });

      // Click on logo to go home
      await page.getByTestId('site-logo-link').click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Accessibility', () => {
    test('privacy policy has proper heading structure', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });

      // The document title should be the first heading
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toBeVisible();

      // There should be exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('terms of service has proper heading structure', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/terms', { timeout: 180_000 });

      // The document title should be the first heading
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toBeVisible();

      // There should be exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('has proper link accessibility', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });

      // Check that links have accessible names (text content or aria-label)
      const links = page.locator('a');
      for (const link of await links.all()) {
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        expect(text?.trim() || ariaLabel?.trim()).toBeTruthy();
      }
    });
  });

  test.describe('SEO and Performance', () => {
    test('privacy policy loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });
      const loadTime = Date.now() - startTime;

      // Turbopack dev server first-compile can take 90s+; cached loads are <5s.
      // Use a generous budget for dev; production budgets are enforced in CI staging.
      const isCI = !!process.env.CI;
      expect(loadTime).toBeLessThan(isCI ? 30_000 : 120_000);
    });

    test('terms of service loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/terms', { timeout: 180_000 });
      const loadTime = Date.now() - startTime;

      const isCI = !!process.env.CI;
      expect(loadTime).toBeLessThan(isCI ? 30_000 : 120_000);
    });

    test('has proper canonical URLs', async ({ page }) => {
      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/privacy', { timeout: 180_000 });
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute('href', /\/legal\/privacy/);

      await page.route('**/api/profile/view', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/audience/visit', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/track', r =>
        r.fulfill({ status: 200, body: '{}' })
      );
      await page.goto('/legal/terms', { timeout: 180_000 });
      const canonical2 = page.locator('link[rel="canonical"]');
      await expect(canonical2).toHaveAttribute('href', /\/legal\/terms/);
    });
  });
});
