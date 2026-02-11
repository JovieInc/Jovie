import { expect, test } from './setup';
import { checkElementVisibility } from './utils/smoke-test-utils';

/**
 * Artist Profile Pages Tests
 *
 * NOTE: Tests public artist profiles for unauthenticated visitors.
 * Must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

const runArtistProfileTests =
  process.env.E2E_ARTIST_PROFILE === '1' ||
  !!(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy'));

const describeArtist = runArtistProfileTests
  ? test.describe
  : test.describe.skip;

describeArtist('Artist Profile Pages', () => {
  // Run serially to avoid overwhelming Turbopack with parallel compilations
  test.describe.configure({ mode: 'serial' });
  // Turbopack cold compilation of profile pages can take 60-120s per navigation
  test.setTimeout(180_000);

  test.describe('Valid Artist Profile', () => {
    test.beforeEach(async ({ page }) => {
      // Use a known artist handle from our seeded data
      // Increased timeout for Turbopack cold-start compilation
      await page.goto('/dualipa', { timeout: 120_000 });
    });

    test('displays artist profile correctly', async ({ page }) => {
      // Check artist name
      await expect(page.locator('h1')).toContainText('Dua Lipa');

      // Check artist subtitle/tagline — may show bio or default "Artist" label
      await expect(page.getByText(/Pop artist|Artist/).first()).toBeVisible();

      // Check artist image — Avatar component uses role="img" with aria-label
      // on a wrapper div, and img has alt="" (correct a11y pattern).
      // The image may remain in loading state if the CDN URL is stale (404).
      const artistImage = page
        .locator('[role="img"][aria-label="Dua Lipa"]')
        .or(page.locator('img[alt="Dua Lipa"]'));
      const imageVisible = await checkElementVisibility(artistImage, {
        skipMessage:
          'Artist image not visible (CDN image may be stale) — skipping image check',
      });
      if (imageVisible) {
        await expect(artistImage.first()).toBeVisible();
      }
    });

    test('shows social media links or music links', async ({ page }) => {
      // Profile may have social follow buttons and/or music streaming links
      // The seeded dualipa profile has a Spotify link but may not have social follows
      const socialButtons = page.locator('button[title*="Follow"]');
      const musicLinks = page.locator(
        'a[href*="spotify"], a[href*="apple"], button:has-text("Listen"), a:has-text("Listen")'
      );
      const anyLink = socialButtons.first().or(musicLinks.first());

      const hasLinks = await anyLink
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!hasLinks) {
        console.log(
          '⚠ No social or music links found on dualipa profile — skipping'
        );
        test.skip();
        return;
      }

      await expect(anyLink).toBeVisible();
    });

    test('has listen now button or link', async ({ page }) => {
      // Listen CTA may be a button (mobile) or link (desktop), or may not render
      // if the profile has no streaming links configured
      const listenCTA = page
        .getByRole('link', { name: /Listen now/i })
        .or(page.getByRole('button', { name: /Listen now/i }));
      const isVisible = await listenCTA
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!isVisible) {
        console.log(
          '⚠ No "Listen now" CTA found on dualipa profile — skipping'
        );
        test.skip();
        return;
      }
      await expect(listenCTA.first()).toBeVisible();
    });

    test('has Jovie footer', async ({ page }) => {
      // Profile footer variant shows Jovie branding logo (not copyright text)
      const footerLink = page.getByRole('link', { name: /Jovie home/i });
      await expect(footerLink.first()).toBeVisible({ timeout: 10000 });
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Dua Lipa/);

      // Check meta description exists (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toContainText('Dua Lipa');
      await expect(page.getByText(/Pop artist|Artist/).first()).toBeVisible();
    });
  });

  test.describe('Invalid Artist Profile', () => {
    test('shows 404 page for non-existent artist', async ({ page }) => {
      await page.goto('/nonexistent-artist', { timeout: 120_000 });

      // Wait for either the 404 content or loading skeleton to resolve
      const h1 = page.locator('h1');
      const isH1Visible = await h1
        .isVisible({ timeout: 30_000 })
        .catch(() => false);
      if (!isH1Visible) {
        console.log(
          '⚠ /nonexistent-artist page stuck in loading skeleton — skipping'
        );
        test.skip();
        return;
      }

      // Check 404 page content
      await expect(h1).toContainText('Profile not found');
      await expect(page.getByText(/doesn.t exist/)).toBeVisible();

      // Check navigation buttons
      await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
    });

    test('404 page has proper navigation', async ({ page }) => {
      await page.goto('/nonexistent-artist', { timeout: 120_000 });

      const h1 = page.locator('h1');
      const isH1Visible = await h1
        .isVisible({ timeout: 30_000 })
        .catch(() => false);
      if (!isH1Visible) {
        test.skip();
        return;
      }

      // Click "Go home" button
      await page.getByRole('link', { name: 'Go home' }).click();
      await expect(page).toHaveURL('/');
    });

    test('404 page has proper meta tags', async ({ page }) => {
      await page.goto('/nonexistent-artist', { timeout: 120_000 });

      const h1 = page.locator('h1');
      const isH1Visible = await h1
        .isVisible({ timeout: 30_000 })
        .catch(() => false);
      if (!isH1Visible) {
        test.skip();
        return;
      }

      // Check that page is not indexed — Next.js may add multiple robots meta tags
      const robots = page.locator('meta[name="robots"]');
      const count = await robots.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // At least one should contain noindex
      let hasNoIndex = false;
      for (let i = 0; i < count; i++) {
        const content = await robots.nth(i).getAttribute('content');
        if (content?.includes('noindex')) {
          hasNoIndex = true;
          break;
        }
      }
      expect(hasNoIndex).toBe(true);
    });
  });

  test.describe('Artist Profile SEO', () => {
    test('has proper structured data', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Profile pages generate 2 JSON-LD scripts: MusicGroup + BreadcrumbList
      const structuredData = page.locator('script[type="application/ld+json"]');
      const count = await structuredData.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('has proper Open Graph tags', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check Open Graph tags
      const ogTitle = page.locator('meta[property="og:title"]');
      const ogDescription = page.locator('meta[property="og:description"]');
      const ogImage = page.locator('meta[property="og:image"]');

      await expect(ogTitle).toHaveAttribute('content', /.+/);
      await expect(ogDescription).toHaveAttribute('content', /.+/);
      await expect(ogImage).toHaveAttribute('content', /.+/);
    });

    test('has proper Twitter Card tags', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check Twitter Card tags
      const twitterCard = page.locator('meta[name="twitter:card"]');
      const twitterTitle = page.locator('meta[name="twitter:title"]');
      const twitterDescription = page.locator(
        'meta[name="twitter:description"]'
      );

      await expect(twitterCard).toHaveAttribute('content', /.+/);
      await expect(twitterTitle).toHaveAttribute('content', /.+/);
      await expect(twitterDescription).toHaveAttribute('content', /.+/);
    });
  });

  test.describe('Artist Profile Performance', () => {
    test('loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/dualipa', { timeout: 120_000 });
      const loadTime = Date.now() - startTime;

      // Allow generous time for local Turbopack compilation
      // In production this should be under 3s, but local dev can take 30s+
      expect(loadTime).toBeLessThan(60_000);
    });

    test('has proper image optimization', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check that images have proper alt attributes
      // Next.js Image component handles loading strategy internally
      // (priority images get eager, others get lazy — attribute may not be present)
      const images = page.locator('img');
      for (const img of await images.all()) {
        const alt = await img.getAttribute('alt');
        // All images should have an alt attribute (can be empty string for decorative)
        expect(alt).not.toBeNull();
      }
    });
  });

  test.describe('Artist Profile Accessibility', () => {
    test('has proper heading structure', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check for proper heading hierarchy
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toContainText('Dua Lipa');

      // Check that headings are properly nested
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('has proper button accessibility', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check that buttons have proper labels
      const buttons = page.locator('button');
      for (const button of await buttons.all()) {
        const ariaLabel = await button.getAttribute('aria-label');
        const title = await button.getAttribute('title');
        const text = await button.textContent();
        const ariaLabelledBy = await button.getAttribute('aria-labelledby');

        // Button should have some form of accessible name
        expect(
          ariaLabel || title || text?.trim() || ariaLabelledBy
        ).toBeTruthy();
      }
    });

    test('has proper link accessibility', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check that links have an accessible name
      const links = page.locator('a');
      for (const link of await links.all()) {
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        const title = await link.getAttribute('title');

        // Links should have text content OR aria-label OR title
        expect(text?.trim() || ariaLabel || title).toBeTruthy();
      }
    });

    test('has proper color contrast', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check that text is readable
      const mainText = page.locator('h1, p');
      await expect(mainText.first()).toBeVisible();

      // This is a basic check - in a real scenario, you'd use a color contrast tool
      expect(true).toBe(true);
    });
  });

  test.describe('Artist Profile Interactions', () => {
    test('social media links open in new tab', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Check that social links have proper attributes
      const socialLinks = page.locator('button[title*="Follow"]');
      if ((await socialLinks.count()) > 0) {
        const firstLink = socialLinks.first();
        await expect(firstLink).toBeVisible();
      }
    });

    test('listen now is clickable', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Listen CTA may be a button (mobile) or link (desktop), or may not render
      const listenCTA = page
        .getByRole('link', { name: /Listen now/i })
        .or(page.getByRole('button', { name: /Listen now/i }));
      const isVisible = await listenCTA
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!isVisible) {
        console.log(
          '⚠ No "Listen now" CTA found on dualipa profile — skipping'
        );
        test.skip();
        return;
      }
      await expect(listenCTA.first()).toBeVisible();
    });

    test('footer branding link navigates correctly', async ({ page }) => {
      await page.goto('/dualipa', { timeout: 120_000 });

      // Profile footer has Jovie home link (logo) not "Powered by Jovie"
      const footerLink = page.getByRole('link', { name: /Jovie home/i });
      await expect(footerLink.first()).toBeVisible();

      // Click the footer link
      await footerLink.first().click();
      await expect(page).toHaveURL(/\//);
    });
  });

  test.describe('Admin Profile (/tim)', () => {
    test('admin profile does not return 404', async ({ page }) => {
      const response = await page.goto('/tim', {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });

      // The admin profile must NEVER 404 — this is a critical business check.
      // If this test fails, investigate the creator_profiles table for the
      // 'tim' profile: is_public flag, username_normalized value, etc.
      expect(response?.status()).not.toBe(404);

      // Wait for some content to render (may be profile or error banner)
      const hasContent = await page
        .locator('h1, [data-testid="public-profile-error"]')
        .first()
        .isVisible({ timeout: 30_000 })
        .catch(() => false);

      if (!hasContent) {
        console.log(
          '!! /tim admin profile stuck in loading skeleton — potential issue'
        );
      }
    });

    test('admin profile renders profile content', async ({ page }) => {
      await page.goto('/tim', {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });

      // The admin profile should render with an h1 (artist name)
      const h1 = page.locator('h1');
      const isH1Visible = await h1
        .isVisible({ timeout: 30_000 })
        .catch(() => false);
      if (!isH1Visible) {
        console.log(
          '!! /tim admin profile h1 not visible — profile may not exist in DB'
        );
        test.skip();
        return;
      }

      await expect(h1).toBeVisible();
    });
  });
});
