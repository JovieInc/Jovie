import { signInUser } from '../helpers/clerk-auth';
import { expect, test } from './setup';

/**
 * Visual Regression Tests
 *
 * Captures screenshots for key pages in light/dark modes to detect visual regressions.
 * Uses Playwright's built-in screenshot comparison with configurable thresholds.
 *
 * Run with: pnpm e2e:visual
 * Update snapshots: pnpm e2e:visual:update
 *
 * Snapshots are stored in: tests/e2e/__snapshots__/
 *
 * This catches issues like:
 * - Wrong design tokens (e.g., white border on dark background)
 * - Theme-specific styling bugs
 * - Layout regressions across viewports
 *
 * @visual-regression
 */

// Helper to set theme
async function setTheme(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark'
) {
  await page.evaluate(t => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('jovie-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('jovie-theme', 'light');
    }
  }, theme);
  await page.waitForTimeout(300); // Allow theme transition
}

// Helper to mask dynamic content that changes between runs
async function maskDynamicContent(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // Mask timestamps, dates, and dynamic counters
    document
      .querySelectorAll('[data-testid="timestamp"], time, [data-dynamic]')
      .forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
  });
}

// Snapshot options with reasonable threshold for CI stability
const snapshotOptions = {
  maxDiffPixelRatio: 0.05, // 5% pixel difference allowed
  threshold: 0.2, // Per-pixel color threshold
  animations: 'disabled' as const,
};

// Override global storageState to run public page tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Visual Regression @visual-regression', () => {
  test.describe('Public Pages', () => {
    test('pricing page - light mode', async ({ page }) => {
      await page.goto('/pricing', { waitUntil: 'networkidle' });
      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('pricing-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('pricing page - dark mode', async ({ page }) => {
      await page.goto('/pricing', { waitUntil: 'networkidle' });
      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('pricing-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('signin page - light mode', async ({ page }) => {
      await page.goto('/signin', { waitUntil: 'networkidle' });
      await setTheme(page, 'light');

      await expect(page).toHaveScreenshot('signin-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('signin page - dark mode', async ({ page }) => {
      await page.goto('/signin', { waitUntil: 'networkidle' });
      await setTheme(page, 'dark');

      await expect(page).toHaveScreenshot('signin-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('signup page - light mode', async ({ page }) => {
      await page.goto('/signup', { waitUntil: 'networkidle' });
      await setTheme(page, 'light');

      await expect(page).toHaveScreenshot('signup-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('signup page - dark mode', async ({ page }) => {
      await page.goto('/signup', { waitUntil: 'networkidle' });
      await setTheme(page, 'dark');

      await expect(page).toHaveScreenshot('signup-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });
  });

  test.describe('Public Profile', () => {
    // Use a known test profile handle or skip if not available
    const testHandle = process.env.E2E_TEST_PROFILE_HANDLE || 'demo';

    test('public profile - light mode', async ({ page }) => {
      await page.goto(`/${testHandle}`, { waitUntil: 'networkidle' });

      // Check if profile exists (not 404)
      const is404 = await page
        .locator('text=not found')
        .isVisible()
        .catch(() => false);
      if (is404) {
        test.skip(true, `Test profile @${testHandle} not found`);
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('profile-public-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('public profile - dark mode', async ({ page }) => {
      await page.goto(`/${testHandle}`, { waitUntil: 'networkidle' });

      const is404 = await page
        .locator('text=not found')
        .isVisible()
        .catch(() => false);
      if (is404) {
        test.skip(true, `Test profile @${testHandle} not found`);
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('profile-public-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('public profile - mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
      await page.goto(`/${testHandle}`, { waitUntil: 'networkidle' });

      const is404 = await page
        .locator('text=not found')
        .isVisible()
        .catch(() => false);
      if (is404) {
        test.skip(true, `Test profile @${testHandle} not found`);
        return;
      }

      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('profile-public-mobile.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });
  });

  test.describe('Dashboard (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      try {
        await signInUser(page);
      } catch {
        test.skip(true, 'Auth not available');
      }
    });

    test('dashboard home - light mode', async ({ page }) => {
      await page.goto('/app/dashboard', { waitUntil: 'networkidle' });

      // Skip if redirected to signin
      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-home-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard home - dark mode', async ({ page }) => {
      await page.goto('/app/dashboard', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-home-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard links - light mode', async ({ page }) => {
      await page.goto('/app/dashboard/links', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-links-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard links - dark mode', async ({ page }) => {
      await page.goto('/app/dashboard/links', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-links-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard analytics - light mode', async ({ page }) => {
      await page.goto('/app/dashboard/analytics', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-analytics-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard analytics - dark mode', async ({ page }) => {
      await page.goto('/app/dashboard/analytics', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-analytics-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard earnings - light mode', async ({ page }) => {
      await page.goto('/app/dashboard/earnings', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-tipping-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('dashboard earnings - dark mode', async ({ page }) => {
      await page.goto('/app/dashboard/earnings', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('dashboard-tipping-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('settings page - light mode', async ({ page }) => {
      await page.goto('/app/settings', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('settings-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('settings page - dark mode', async ({ page }) => {
      await page.goto('/app/settings', { waitUntil: 'networkidle' });

      if (page.url().includes('/signin')) {
        test.skip(true, 'Not authenticated');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('settings-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });
  });

  test.describe('Admin Pages (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      try {
        await signInUser(page);
      } catch {
        test.skip(true, 'Auth not available');
      }
    });

    test('admin creators - light mode', async ({ page }) => {
      await page.goto('/app/admin/creators', { waitUntil: 'networkidle' });

      // Skip if not admin or redirected
      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-creators-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('admin creators - dark mode', async ({ page }) => {
      await page.goto('/app/admin/creators', { waitUntil: 'networkidle' });

      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-creators-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('admin overview - light mode', async ({ page }) => {
      await page.goto('/app/admin', { waitUntil: 'networkidle' });

      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-overview-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('admin overview - dark mode', async ({ page }) => {
      await page.goto('/app/admin', { waitUntil: 'networkidle' });

      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-overview-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('admin activity - light mode', async ({ page }) => {
      await page.goto('/app/admin/activity', { waitUntil: 'networkidle' });

      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'light');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-activity-light.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });

    test('admin activity - dark mode', async ({ page }) => {
      await page.goto('/app/admin/activity', { waitUntil: 'networkidle' });

      if (
        page.url().includes('/signin') ||
        page.url().includes('/unauthorized')
      ) {
        test.skip(true, 'Not authorized for admin');
        return;
      }

      await setTheme(page, 'dark');
      await maskDynamicContent(page);

      await expect(page).toHaveScreenshot('admin-activity-dark.png', {
        fullPage: true,
        ...snapshotOptions,
      });
    });
  });

  test.describe('Responsive Viewports', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 812 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const viewport of viewports) {
      test(`homepage - ${viewport.name} viewport`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto('/', { waitUntil: 'networkidle' });
        await maskDynamicContent(page);

        await expect(page).toHaveScreenshot(
          `homepage-${viewport.name}.png`,
          snapshotOptions
        );
      });
    }
  });
});
