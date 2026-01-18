import { expect, test } from './setup';

/**
 * Dashboard Landing Smoke Tests (ENG-002)
 *
 * Verifies that authenticated users can access the dashboard
 * without being redirected back to onboarding.
 *
 * This test specifically targets the redirect loop bug (ENG-002)
 * where users completing onboarding would be redirected back
 * to onboarding due to a race condition between transaction
 * commit and proxy's database read.
 *
 * @smoke
 */

test.describe('Dashboard Landing @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication for testing
    await page.route('**/api/auth/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ authenticated: true }),
      });
    });
  });

  test('dashboard page loads without redirect to onboarding', async ({
    page,
  }) => {
    // Track all navigations to detect redirect loops
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto('/app/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Wait a bit to catch any delayed redirects
    await page.waitForTimeout(2000);

    // Verify we're on the dashboard, NOT on onboarding
    const currentUrl = page.url();
    expect(currentUrl).toContain('/app/dashboard');
    expect(currentUrl).not.toContain('/onboarding');

    // Verify onboarding page was never loaded during navigation
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(
      wentToOnboarding,
      `Redirect loop detected. Navigation history: ${navigatedUrls.join(' -> ')}`
    ).toBe(false);
  });

  test('dashboard does not flash onboarding page', async ({ page }) => {
    // Track all navigations
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto('/app/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify onboarding page was never loaded
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(wentToOnboarding).toBe(false);

    // Also verify no waitlist redirect
    const wentToWaitlist = navigatedUrls.some(url => url.includes('/waitlist'));
    expect(wentToWaitlist).toBe(false);
  });

  test('dashboard content is visible after navigation', async ({ page }) => {
    await page.goto('/app/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Verify dashboard content is visible (not blank/loading)
    // The Dashboard heading or welcome message should be visible
    const hasContent = await page
      .getByText(/Dashboard|Welcome/i)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    expect(hasContent, 'Dashboard should show content, not be blank').toBe(
      true
    );
  });

  test('onboarding completion cookie bypasses redirect loop', async ({
    page,
  }) => {
    // Simulate the cookie that gets set after onboarding completion
    await page.context().addCookies([
      {
        name: 'jovie_onboarding_complete',
        value: '1',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // Track navigations
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto('/app/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // With the cookie set, user should NOT be redirected to onboarding
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(
      wentToOnboarding,
      'Onboarding completion cookie should prevent redirect'
    ).toBe(false);

    // Verify we stayed on dashboard
    expect(page.url()).toContain('/app/dashboard');
  });

  test('multiple dashboard page loads do not cause redirect loops', async ({
    page,
  }) => {
    // Load dashboard multiple times to ensure no accumulating redirect issues
    for (let i = 0; i < 3; i++) {
      await page.goto('/app/dashboard', { timeout: 30000 });
      await page.waitForLoadState('networkidle');

      const currentUrl = page.url();
      expect(currentUrl, `Load ${i + 1}: Should stay on dashboard`).toContain(
        '/app/dashboard'
      );
      expect(
        currentUrl,
        `Load ${i + 1}: Should not redirect to onboarding`
      ).not.toContain('/onboarding');
    }
  });
});
