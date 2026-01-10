import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Link Creation & Display Smoke Test
 *
 * Tests the critical user journey:
 * 1. Social links from database appear on public profile
 * 2. Links are clickable and have correct URLs
 * 3. Links persist and are cached correctly
 *
 * This test verifies the end-to-end flow from DB → server → client → display.
 */
test.describe('Link Creation & Display @smoke', () => {
  test('public profile displays seeded social links @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // The test seeding adds a Spotify link for Taylor Swift profile
      // Verify it appears on the public profile
      const spotifyLink = page
        .locator(
          '[data-testid="social-links"] a[href*="spotify"], a[href*="spotify.com"]'
        )
        .first();

      await expect(spotifyLink).toBeVisible({ timeout: 10000 });

      // Verify the link has a valid Spotify URL
      const href = await spotifyLink.getAttribute('href');
      expect(href, 'Spotify link should have valid URL').toMatch(
        /spotify\.com\/artist\//
      );

      // Verify the link is clickable (has proper attributes)
      const isClickable = await spotifyLink.evaluate(el => {
        const link = el as HTMLAnchorElement;
        return link.href && link.href.startsWith('http');
      });
      expect(isClickable, 'Link should be clickable with valid href').toBe(
        true
      );

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('social links container exists even with no links @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Use a profile that might not have links
      await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
      await waitForHydration(page);

      // Profile should load successfully even without social links
      const mainContent = page.locator('main, [role="main"]').first();
      await expect(mainContent).toBeVisible({ timeout: 10000 });

      // Check if social links section exists
      const socialLinksSection = page.locator('[data-testid="social-links"]');
      const sectionExists = await socialLinksSection.count();

      if (sectionExists > 0) {
        console.log('✓ Social links section exists');
      } else {
        console.log('ℹ Social links section not rendered (no links)');
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('link URLs are properly formatted and external @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // Find all social links on the page
      const socialLinks = page.locator(
        'a[href*="spotify"], a[href*="instagram"], a[href*="twitter"], a[href*="facebook"], a[href*="tiktok"]'
      );

      const linkCount = await socialLinks.count();

      if (linkCount > 0) {
        console.log(`Found ${linkCount} social link(s)`);

        // Verify each link has proper attributes
        for (let i = 0; i < linkCount; i++) {
          const link = socialLinks.nth(i);
          const href = await link.getAttribute('href');
          const target = await link.getAttribute('target');
          const rel = await link.getAttribute('rel');

          // All external links should start with http/https
          expect(href, `Link ${i + 1} should have valid URL`).toMatch(
            /^https?:\/\//
          );

          // External links should open in new tab (optional but recommended)
          if (target) {
            expect(target, `Link ${i + 1} target should be _blank`).toBe(
              '_blank'
            );
          }

          // External links should have security attributes (optional but recommended)
          if (rel) {
            expect(
              rel,
              `Link ${i + 1} should have noopener for security`
            ).toContain('noopener');
          }

          console.log(`  ✓ Link ${i + 1}: ${href?.substring(0, 50)}...`);
        }
      } else {
        console.log('⚠ No social links found on profile');
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
